import json

from pydantic import BaseModel, Field

from layton_eval.settings import settings


class BenchmarkAnswer(BaseModel):
    justification: str = Field(description="A justification for the answer you think is correct.")
    answer: str = Field(
        description="A final answer that you think correct and suits your justification."
    )


if __name__ == "__main__":
    schema = BenchmarkAnswer.model_json_schema()
    schema["additionalProperties"] = False
    full_schema = {
        "type": "json_schema",
        "json_schema": {
            "schema": schema,
            "name": BenchmarkAnswer.__name__,
            "strict": True,
        },
    }
    with open(settings.root_dir / "json_schemas" / "benchmark_answer_schema.json", "w") as f:
        json.dump(full_schema, f, indent=4)
