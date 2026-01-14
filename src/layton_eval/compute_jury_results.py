import argparse
import glob

import polars as pl


def main(glob_prefix: str):
    df = (
        pl.read_ndjson(glob.glob(f"{glob_prefix}*.jsonl"))["id", "custom_id", "answer", "model"]
        .with_columns(
            pl.col("answer")
            .str.json_decode(
                dtype=pl.Struct(
                    fields={"is_answer_correct": pl.Boolean, "is_justification_correct": pl.Boolean}
                )
            )
            .struct.unnest()
        )
        .with_columns(
            pl.col("is_answer_correct")
            .and_(pl.col("is_justification_correct"))
            .alias("both_correct")
        )
    )
    df = df.group_by("custom_id").agg(
        pl.col("is_answer_correct").mean().round(2).alias("answer_correctness"),
        pl.col("is_justification_correct").mean().round(2).alias("justification_correctness"),
        pl.col("both_correct").mean().round(2).alias("both_correctness"),
    )
    output_file_path = f"{glob_prefix.replace('judge_', 'jury_')}.jsonl"
    df.write_ndjson(output_file_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--glob-prefix", type=str, required=True)
    args = parser.parse_args()
    main(args.glob_prefix)
