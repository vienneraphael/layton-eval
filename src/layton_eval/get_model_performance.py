import argparse

import numpy as np
import polars as pl
from ppi_py import ppi_mean_pointestimate


def get_jury_df(judge_files: list[str]):
    return (
        pl.read_ndjson(judge_files)["custom_id", "answer"]
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
        .group_by("custom_id")
        .agg(
            pl.col("is_answer_correct").mean().alias("answer_correctness"),
            pl.col("is_justification_correct").mean().alias("justification_correctness"),
            pl.col("both_correct").mean().alias("both_correctness"),
        )
    )


def get_ppi_inputs(
    df_human: pl.DataFrame, df_judge: pl.DataFrame, field_name: str = "both_correct"
):
    judge_field_name = field_name.replace("is_", "") + "ness"
    df_labelled_unsampled = df_human.with_columns(
        pl.mean_horizontal(pl.selectors.starts_with(field_name)).alias(judge_field_name)
    )
    distribution = df_judge.get_column(judge_field_name).value_counts()
    n_samples = (
        distribution.with_columns(pl.col("count").alias("n_samples"))
        .select(judge_field_name, "n_samples")
        .to_dicts()
    )
    sub_dfs = []
    for elem in n_samples:
        value, count = elem[judge_field_name], elem["n_samples"]
        sub_dfs.append(
            df_labelled_unsampled.filter(pl.col(judge_field_name) == value).sample(
                count, with_replacement=True, shuffle=True
            )
        )
    df_labelled = pl.concat(sub_dfs, how="vertical")
    Y_hat_unlabelled = df_judge[judge_field_name].to_numpy().astype(float)
    human_suffix = field_name.replace("is_", "")
    Y = df_labelled[f"human_{human_suffix}"].to_numpy().astype(float)
    Y_hat = df_labelled[judge_field_name].to_numpy().astype(float)
    return Y, Y_hat, Y_hat_unlabelled


def get_ppi_results(
    df_human: pl.DataFrame, df_judge: pl.DataFrame, field_name: str = "both_correct"
):
    Y, Y_hat, Y_hat_unlabelled = get_ppi_inputs(df_human, df_judge, field_name)
    ppi_pointestimate = ppi_mean_pointestimate(Y, Y_hat, Y_hat_unlabelled)
    return ppi_pointestimate


def get_model_performance(
    df_human: pl.DataFrame, df_judge: pl.DataFrame, field_name: str = "both_correct"
) -> dict[str, float]:
    ppi_point_estimates = []
    for _ in range(1000):
        ppi_pointestimate = get_ppi_results(df_human, df_judge, field_name=field_name)
        ppi_point_estimates.append(ppi_pointestimate[0])
    ppi_ci_lower = np.percentile(ppi_point_estimates, 2.5)
    ppi_ci_upper = np.percentile(ppi_point_estimates, 97.5)
    spread = (ppi_ci_upper - ppi_ci_lower) / 2
    score = (ppi_ci_upper + ppi_ci_lower) / 2
    return {
        "score": (score * 100).round(1).item(),
        "95% CI (±)": (np.floor(spread * 100 * 10) + 1).item() / 10,
    }


def main(field_name: str, judge_files: list[str]):
    provider = judge_files[0].split("_")[1]
    if len(judge_files) != 3:
        raise ValueError("Expected 3 judge files, got {}".format(len(judge_files)))
    df_jury = get_jury_df(judge_files)
    df_human = pl.read_ndjson(
        "hf://datasets/rvienne/layton-eval-ppi/ppi_llm.jsonl", infer_schema_length=100000
    ).filter((pl.col("human_answer_correct").is_not_null()) & (pl.col("provider") != provider))
    return get_model_performance(df_human, df_jury, field_name=field_name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--field-name", type=str, default="both_correct")
    parser.add_argument(
        "--judge-files",
        type=str,
        nargs="+",
        required=True,
        help="List of judge result files (supports shell wildcards like results/*.jsonl)",
    )
    args = parser.parse_args()
    model_performance = main(args.field_name, args.judge_files)
    print(model_performance)
