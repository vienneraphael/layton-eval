import json

import polars as pl

from layton_eval.settings import settings
from layton_eval.utils import load_txt


def generate_raw_file():
    df = pl.read_ndjson(settings.root_dir / "datasets" / "layton_eval.jsonl")
    image_prompt = load_txt(settings.root_dir / "prompts" / "justification" / "visual_riddle.txt")
    text_prompt = load_txt(settings.root_dir / "prompts" / "justification" / "text_riddle.txt")
    with open(settings.root_dir / "raw_files" / "justification.jsonl", "w") as f:
        for row in df.iter_rows(named=True):
            raw_request = {
                "system_prompt": "",
                "messages": [],
                "max_tokens": 1000,
            }
            content = [
                {"type": "text", "text": f"Riddle question: {row.get('description')}"},
            ]
            if row.get("split") == "vlm":
                content.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{row.get('img')}"},
                    },
                )
            if row.get("first_hint"):
                content.append(
                    {"type": "text", "text": f"First hint: {row.get('first_hint')}"},
                )
            if row.get("second_hint"):
                content.append(
                    {"type": "text", "text": f"Second hint: {row.get('second_hint')}"},
                )
            if row.get("third_hint"):
                content.append(
                    {"type": "text", "text": f"Third hint: {row.get('third_hint')}"},
                )
            if row.get("special_hint"):
                content.append(
                    {"type": "text", "text": f"Special hint: {row.get('special_hint')}"},
                )
            content.extend(
                [
                    {"type": "text", "text": f"Riddle answer: {row.get('answer')}"},
                    {"type": "text", "text": f"Riddle solution: {row.get('solution')}"},
                ]
            )
            raw_request["system_prompt"] = (
                image_prompt if row.get("split") == "vlm" else text_prompt
            )
            raw_request["messages"] = [
                {
                    "role": "user",
                    "content": content,
                }
            ]
            json.dump(raw_request, f)
            f.write("\n")


if __name__ == "__main__":
    generate_raw_file()
