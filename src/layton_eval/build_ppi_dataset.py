import polars as pl
import glob
from layton_eval.settings import settings
import argparse

def get_predictions_df(split: str):
    return pl.read_ndjson(glob.glob(f"results/benchmark_*_{split}_*.jsonl"), include_file_paths="source_file")["custom_id", "answer", "source_file"].with_columns(
        pl.col("answer").str.json_decode(dtype=pl.Struct(fields={"answer": pl.String, "justification": pl.String})).struct.unnest(),
        (
            pl.col("source_file").str.split("_").list.get(2) +
            pl.when(pl.col("source_file").str.contains("thinking_32k")).then(pl.lit("_thinking_32k")).otherwise(pl.lit(""))).alias("model"),
            pl.col("source_file").str.split("_").list.get(1).alias("provider")
    ).rename({"custom_id": "riddle_id"}).drop("source_file")

def get_judges_results_df(judge_file_path: str):
    model_name = judge_file_path.split("/")[-1].split("_")[2]
    if "thinking_32k" in judge_file_path:
        model_name += "_thinking_32k"
    return pl.read_ndjson(judge_file_path)["custom_id", "answer", "model"].with_columns(
        pl.col("answer").str.json_decode(dtype=pl.Struct(fields={"is_answer_correct": pl.Boolean, "is_justification_correct": pl.Boolean})).struct.unnest()
    ).with_columns(
        pl.col("is_answer_correct").and_(pl.col("is_justification_correct")).alias("both_correct")
    ).insert_column(
        0,
        pl.lit(model_name).alias("judged_model")
    ).rename({"model": "judge_model", "custom_id": "riddle_id"}).drop("answer")

def get_human_annotations_df(split: str):
    return pl.read_ndjson(settings.root_dir / "annotations" / f"{split}.jsonl").rename({"is_answer_correct": "human_answer_correct", "is_justification_correct": "human_justification_correct"}).with_columns(
        (
            pl.col("source_file").str.split("_").list.get(2) +
            pl.when(pl.col("source_file").str.contains("thinking_32k")).then(pl.lit("_thinking_32k")).otherwise(pl.lit(""))).alias("model"),
    ).with_columns(pl.col("human_answer_correct").and_(pl.col("human_justification_correct")).alias("human_both_correct")).drop("notes", "custom_id", "source_file", "provider")

def main(judge_file_paths: list[str]):
    df_judge = pl.concat([get_judges_results_df(judge_file_path) for judge_file_path in judge_file_paths]).pivot(
        on="judge_model",
        index=["riddle_id", "judged_model"],
        values=["is_answer_correct", "is_justification_correct", "both_correct"],
    )
    split = "llm" if "llm" in judge_file_paths[0] else "vlm"
    df_human = get_human_annotations_df(split=split)
    df_predictions = get_predictions_df(split=split)
    df_predictions.join(df_judge, left_on=["riddle_id", "model"], right_on=["riddle_id", "judged_model"], how="left").join(
    df_human, on=["riddle_id", "model"], how="left"
    ).select(
        "riddle_id",
        "provider",
        "model",
        "answer",
        "justification",
        'is_answer_correct_mistral-large-2512',
        'is_answer_correct_claude-opus-4-5-20251101',
        'is_answer_correct_gpt-5.1-2025-11-13',
        'is_answer_correct_gemini-3-pro-preview',
        'is_justification_correct_mistral-large-2512',
        'is_justification_correct_claude-opus-4-5-20251101',
        'is_justification_correct_gpt-5.1-2025-11-13',
        'is_justification_correct_gemini-3-pro-preview',
        'both_correct_mistral-large-2512',
        'both_correct_claude-opus-4-5-20251101',
        'both_correct_gpt-5.1-2025-11-13',
        'both_correct_gemini-3-pro-preview',
        "human_answer_correct",
        "human_justification_correct",
        "human_both_correct",
    ).write_ndjson(f"ppi_{split}.jsonl")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--judge-file-paths", type=str, nargs="+", required=True, help="List of judge result files (supports shell wildcards like results/*.jsonl)")
    args = parser.parse_args()
    main(judge_file_paths=args.judge_file_paths)
