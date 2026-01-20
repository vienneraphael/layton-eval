import argparse
import json
from json_repair import repair_json

def repair_jsonl_file(file_path: str):
    with open(file_path, "r") as f:
        repaired_lines = []
        for line in f:
            d = json.loads(line)
            d["answer"] = repair_json(d["answer"])
            repaired_lines.append(json.dumps(d))
    with open(file_path, "w") as f:
        for line in repaired_lines:
            f.write(line + "\n\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file-path", type=str, required=True)
    args = parser.parse_args()
    repair_jsonl_file(args.file_path)
