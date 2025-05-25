import httpx
import json
from pydantic import BaseModel, Field
from openai import Client, DefaultHttpxClient
import base64
import os
import constants as c
import polars as pl

# Set this for your environment (or use dotenv)
# export MISTRAL_API_KEY=your_token_here
API_URL = "https://api.mistral.ai/v1/chat/completions"
HEADERS = {
    "Authorization": f"Bearer {os.environ['MISTRAL_API_KEY']}",
    "Content-Type": "application/json",
}


EXP_NAME = "nohint"
MODE = "LLM"  # LLM or VLM

HINTS = 0  # 0 or 1, or 2, or 3, or 4
FILTER_DATASET = False  # If HINTS = 0 to still filter the dataset based on the samples which have all 4 hints

PREFIX_OUT = "batch_requests/" + EXP_NAME + "/" + MODE + "/"

NUM_REQUESTS = None  # 50

if MODE == "VLM":
    MODELS = {
        "openai": ["gpt-4o", "o3-mini"],
        "mistral": ["pixtral-large-latest"],
    }
elif MODE == "LLM":
    MODELS = {
        "openai": ["gpt-4o", "o3-mini"],
        "mistral": ["mistral-medium-2505"],
    }

CSV_FILE = "./layton_eval.csv"  # sample_e2e.csv"  # "data.csv"


def encode_image(image_path: str):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


# =============================================================================
# 1. Define Your Complex BaseModel for Response Validation
# =============================================================================


class LaytonRiddle(BaseModel):
    answer: str = Field(
        description="The answer to the riddle, it should be in the simplest form possible. The answer should be the one to a question asked in the riddle description and is often a number or word."
    )
    justification: str = Field(
        description="The justification of the answer, with reasoning followed."
    )


# =============================================================================
# 2. Create a Custom HTTP Transport to Intercept and Capture Requests
# =============================================================================


class CapturingTransport(httpx.BaseTransport):
    """
    A custom HTTP transport that intercepts every request, captures its details,
    and then raises an exception to abort the network call.
    """

    def __init__(self):
        self.captured_request = None

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        # Build a dictionary with the captured details.
        captured = {
            "method": request.method,
            # Use the relative URL (path only); no host information.
            "url": request.url.raw_path.decode(),
        }
        try:
            if request.content:
                captured["body"] = json.loads(request.content.decode("utf-8"))
            else:
                captured["body"] = None
        except Exception:
            captured["body"] = (
                request.content.decode("utf-8") if request.content else None
            )

        self.captured_request = captured

        # For user feedback, print a pretty version of the captured API request.
        # print("=== Captured Request ===")
        # print("Method:", captured["method"])
        # print("URL:", captured["url"])
        # print("Body:", json.dumps(captured["body"], indent=2))
        # print("========================")

        # Abort the actual HTTP call.
        raise Exception("Aborted request in CapturingTransport to capture payload.")


# =============================================================================
# 3. Instantiate the OpenAI Client with the Custom HTTP Client
# =============================================================================
# =============================================================================
# 4. Define the Batch API Request Capture Function
# =============================================================================


def batch_create_chat_completion(custom_id: str, provider: str, **kwargs) -> str:
    """
    Captures the full API request (as built by the SDK) when calling the beta chat
    completions parsing method. The function returns a single-line JSON string (JSONL)
    that contains:

      - custom_id: A required identifier provided by the caller.
      - method: HTTP method (e.g., "POST").
      - url: The relative endpoint (e.g., "/v1/chat/completions").
      - body: The full JSON payload built by the SDK.

    If the SDK’s validation fails (for example, due to an invalid response_format),
    no request is built and an error is raised.
    """
    # Reset any previously captured request.
    # Create an instance of our custom transport.
    capturing_transport = CapturingTransport()

    # Build a custom HTTP client using the DefaultHttpxClient, providing our transport.
    custom_http_client = DefaultHttpxClient(transport=capturing_transport)

    if provider == "openai":
        # IMPORTANT: Set max_retries=0 to ensure that no internal retries mask validation errors.
        client = Client(http_client=custom_http_client, max_retries=0)
        capturing_transport.captured_request = None

        try:
            # Use the beta parsing method (which employs BaseModel for response_format)
            # Instead of calling the API directly, our transport intercepts the outgoing request.
            _ = client.beta.chat.completions.parse(**kwargs)
        except Exception as e:
            # If no payload was captured, assume that SDK validation failed.
            if capturing_transport.captured_request is None:
                raise e

            # Otherwise, extract the captured request details.
            captured = capturing_transport.captured_request

            # Build the batch API request JSON object.
            batch_request = {
                "custom_id": custom_id,
                "method": captured["method"],
                "url": captured["url"],
                "body": captured["body"],
            }
            # Convert the object to a single-line JSON string.
            json_line = json.dumps(batch_request)

            # Present the captured request prettily on the console.
            # print("Captured API request to be added to the batch JSONL file:")
            # print(json.dumps(batch_request, indent=2))
            return json_line

        # If no exception occurred (unexpected), signal an error.
        raise Exception(
            "Expected interception did not occur; check your SDK validation."
        )

    elif provider == "mistral":
        body = {
            "model": kwargs["model"],
            "messages": kwargs["messages"],
        }
        return json.dumps(
            {
                "custom_id": custom_id,
                "method": "POST",
                "url": "/v1/chat/completions",
                "body": body,
            }
        )
    raise Exception("Unknown company name.")


# =============================================================================
# 5. Usage
# =============================================================================


# Beta chat completion request using a BaseModel for response_format. The SDK will
# validate the input and build the proper JSON body behind the scenes.
def main():

    excluded_categories = [
        "Arrange",
        "Gubbins Guiding",
        "Draw Line",
        "Thingamajig Thinking",
        "Sliding",
        "Placement",
        "Slide",
        "Piece Positioning",
    ]
    df = (
        pl.read_csv(os.path.join(c.ROOT_DIR, CSV_FILE))
        .filter(
            pl.col("category")
            .is_in(excluded_categories)
            .not_()
            .and_(pl.col("img").is_not_null())
        )
        .select(
            "id",
            "img",
            "description",
            "first_hint",
            "second_hint",
            "third_hint",
            "special_hint",
            "requires_game_engine",
            "is_description_sufficient",
        )
    )
    df = df.filter(pl.col("requires_game_engine") != True)
    print(df.shape)
    # print(df.head(5))

    # Filter Dataset
    if HINTS or FILTER_DATASET:
        df = df.filter(pl.col("special_hint").is_not_null())
        print(df.shape)
        print(f"{df.shape[0]/856}% of dataset")
    if MODE == "LLM":
        df = df.filter(pl.col("is_description_sufficient") != False)
        print("LLM: ", df.shape)
    elif MODE == "VLM":
        df = df.filter(pl.col("is_description_sufficient") != True)
        print("VLM: ", df.shape)

    if NUM_REQUESTS:
        df = df.head(NUM_REQUESTS)
        print(NUM_REQUESTS, ": ", df.shape)

    for provider, model_list in MODELS.items():
        for model in model_list:

            OUT_FILE = PREFIX_OUT + EXP_NAME + "_" + model + "_" + MODE + ".jsonl"
            os.makedirs(os.path.join(c.ROOT_DIR, PREFIX_OUT), exist_ok=True)

            for i, (
                riddle_id,
                img,
                description,
                first_hint,
                second_hint,
                third_hint,
                special_hint,
                requires_game_engine,
                is_description_sufficient,
            ) in enumerate(list(df.iter_rows(named=False))):

                if HINTS:
                    if HINTS == 1:
                        api_call_params["messages"]["content"]
                        hints = [first_hint]
                    elif HINTS == 2:
                        hints = [first_hint, second_hint]
                    elif HINTS == 3:
                        hints = [first_hint, second_hint, third_hint]
                    elif HINTS == 4:
                        hints = [first_hint, second_hint, third_hint, special_hint]
                    else:
                        raise Exception("Invalid number of hints.")
                    print(hints.shape())

                if MODE == "VLM":
                    encoded_image = (
                        img  # (encode_image(os.path.join(c.ROOT_DIR, image_path)))
                    )

                    api_call_params = {
                        "model": model,
                        "messages": [
                            {
                                "role": "system",
                                "content": "You are an expert in riddle resolution. You are given a Professor Layton riddle description, and an image. Return a JSON with the answer and justification.",
                            },
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": f"riddle description: {description}",
                                    },
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": f"data:image/png;base64,{encoded_image}"
                                        },
                                    },
                                ]
                                + [
                                    {
                                        "type": "text",
                                        "text": f"Hint {hint_n+1}: {hints[hint_n]}",
                                    }
                                    for hint_n in range(HINTS)
                                ],
                            },
                        ],
                        "response_format": LaytonRiddle,  # Using the pydantic BaseModel for validation.
                    }
                elif MODE == "LLM":
                    api_call_params = {
                        "model": model,
                        "messages": [
                            {
                                "role": "system",
                                "content": "You are an expert in riddle resolution. You are given a Professor Layton riddle description. Return a JSON with the answer and justification.",
                            },
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": f"riddle description: {description}",
                                    },
                                ]
                                + [
                                    {
                                        "type": "text",
                                        "text": f"Hint {hint_n+1}: {hints[hint_n]}",
                                    }
                                    for hint_n in range(HINTS)
                                ],
                            },
                        ],
                        "response_format": LaytonRiddle,  # Using the pydantic BaseModel for validation.
                    }
                else:
                    raise Exception(
                        "Invalid mode specified. Supported modes: LLM and VLM."
                    )

                # Instead of calling client.beta.chat.completions.parse() directly,
                # call our batch API request capture function.
                try:
                    captured_json_line = batch_create_chat_completion(
                        f"request-{riddle_id}-{i}", provider, **api_call_params
                    )
                except Exception as ex:
                    print("Error during batch API request creation:", ex)
                    raise

                # Append the captured JSONL line to your batch file.
                if captured_json_line:
                    with open(OUT_FILE, "a") as f:
                        f.write(captured_json_line + "\n")
                    print(f"Captured API request written to {OUT_FILE}")


if __name__ == "__main__":
    main()
