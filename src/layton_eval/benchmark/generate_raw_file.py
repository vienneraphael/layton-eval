import argparse
import json
import typing as t

import polars as pl

from layton_eval.settings import settings
from layton_eval.utils import load_txt


def generate_raw_file(
    split: t.Literal["vlm", "llm"], max_tokens: int | None = None, hints: int = 0
):
    df = pl.read_ndjson(
        "hf://datasets/rvienne/layton-eval/layton_eval_llm.jsonl", infer_schema_length=100000
    ).filter(pl.col("split") == split)
    image_prompt = load_txt(settings.root_dir / "prompts" / "benchmark" / "visual_riddle.txt")
    text_prompt = load_txt(settings.root_dir / "prompts" / "benchmark" / "text_riddle.txt")
    file_name = f"benchmark_{split}_hints_{hints}"
    if max_tokens:
        file_name += "_max_tokens"
    file_name += ".jsonl"
    file_path = settings.root_dir / "raw_files" / file_name
    total_chars = 0

    with open(file_path, "w") as f:
        for row in df.iter_rows(named=True):
            raw_request = {
                "id": row.get("id"),
                "system_prompt": "",
                "messages": [],
            }
            if max_tokens:
                raw_request["max_tokens"] = max_tokens
            total_chars += len(row.get("description"))
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
            if hints >= 1 and row.get("first_hint"):
                content.append(
                    {"type": "text", "text": f"First hint: {row.get('first_hint')}"},
                )
                total_chars += len(row.get("first_hint"))
            if hints >= 2 and row.get("second_hint"):
                content.append(
                    {"type": "text", "text": f"Second hint: {row.get('second_hint')}"},
                )
                total_chars += len(row.get("second_hint"))
            if hints >= 3 and row.get("third_hint"):
                content.append(
                    {"type": "text", "text": f"Third hint: {row.get('third_hint')}"},
                )
                total_chars += len(row.get("third_hint"))
            if hints >= 4 and row.get("special_hint"):
                content.append(
                    {"type": "text", "text": f"Special hint: {row.get('special_hint')}"},
                )
                total_chars += len(row.get("special_hint"))
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
    print(f"Total characters: {total_chars}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-tokens", type=int, help="Max tokens for the response")
    parser.add_argument("--split", type=str, required=True)
    parser.add_argument("--hints", type=int, default=0)
    args = parser.parse_args()
    generate_raw_file(split=args.split, max_tokens=args.max_tokens, hints=args.hints)
