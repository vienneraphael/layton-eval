import argparse
import json
import re
import typing as t

import polars as pl

from layton_eval.settings import settings
from layton_eval.utils import load_txt


def generate_raw_file(
    split: t.Literal["vlm", "llm"], max_tokens: bool = False, results_file_path: str = None
):
    df = pl.read_ndjson(settings.root_dir / "datasets" / "layton_eval.jsonl").filter(
        pl.col("split") == split
    )
    model_tag = results_file_path.split("/")[-1].replace("benchmark_", "")
    model_tag = re.sub(r"_hints_\d+", "", model_tag)
    image_prompt = load_txt(settings.root_dir / "prompts" / "benchmark_judge" / "visual_riddle.txt")
    text_prompt = load_txt(settings.root_dir / "prompts" / "benchmark_judge" / "text_riddle.txt")
    file_name = f"judge_{model_tag}"
    if max_tokens:
        file_name.replace(".jsonl", "")
        file_name += "_max_tokens"
        file_name += ".jsonl"
    file_path = settings.root_dir / "raw_files" / file_name
    total_chars = 0
    df_results = pl.read_ndjson(results_file_path).select("custom_id", "answer")
    joined_df = df.join(df_results, left_on="id", right_on="custom_id", suffix="_results")
    print(joined_df.columns)
    print(joined_df.head())
    with open(file_path, "w") as f:
        for row in joined_df.iter_rows(named=True):
            raw_request = {
                "id": row.get("id"),
                "system_prompt": "",
                "messages": [],
            }
            if max_tokens:
                raw_request["max_tokens"] = 64000
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
            if row.get("first_hint"):
                content.append(
                    {"type": "text", "text": f"First hint: {row.get('first_hint')}"},
                )
                total_chars += len(row.get("first_hint"))
            if row.get("second_hint"):
                content.append(
                    {"type": "text", "text": f"Second hint: {row.get('second_hint')}"},
                )
                total_chars += len(row.get("second_hint"))
            if row.get("third_hint"):
                content.append(
                    {"type": "text", "text": f"Third hint: {row.get('third_hint')}"},
                )
                total_chars += len(row.get("third_hint"))
            if row.get("special_hint"):
                content.append(
                    {"type": "text", "text": f"Special hint: {row.get('special_hint')}"},
                )
                total_chars += len(row.get("special_hint"))
            raw_request["system_prompt"] = (
                image_prompt if row.get("split") == "vlm" else text_prompt
            )
            total_chars += len(text_prompt) if row.get("split") == "llm" else len(image_prompt)
            content.extend(
                [
                    {"type": "text", "text": f"Riddle answer: {row.get('answer')}"},
                    {"type": "text", "text": f"Riddle solution: {row.get('solution')}"},
                ]
            )
            total_chars += len(row.get("answer"))
            if row.get("solution"):
                total_chars += len(row.get("solution"))
            content.append(
                {
                    "type": "text",
                    "text": f"Suggested justification: {row.get('justification')}",
                }
            )
            total_chars += len(row.get("justification"))
            answer_dict = json.loads(row.get("answer_results"))
            content.append(
                {
                    "type": "text",
                    "text": f"Participant answer: {answer_dict.get('answer')}",
                }
            )
            total_chars += len(answer_dict.get("answer"))
            content.append(
                {
                    "type": "text",
                    "text": f"Participant justification: {answer_dict.get('justification')}",
                }
            )
            total_chars += len(answer_dict.get("justification"))
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
    parser.add_argument("--max-tokens", action="store_true")
    parser.add_argument("--split", type=str, required=True)
    parser.add_argument("--results-file-path", type=str, required=True)
    args = parser.parse_args()
    generate_raw_file(
        split=args.split, max_tokens=args.max_tokens, results_file_path=args.results_file_path
    )
