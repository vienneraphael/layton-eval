import argparse

import numpy as np
import polars as pl
from ppi_py import ppi_mean_pointestimate


def get_ppi_inputs(df_ppi: pl.DataFrame, provider: str, model: str, field_name="both_correct"):
    judge_field_name = field_name.replace("is_", "") + "ness"
    df_ppi = df_ppi.with_columns(
        pl.mean_horizontal(pl.selectors.starts_with(field_name)).alias(judge_field_name)
    )
    df_labelled_unsampled = df_ppi.filter(
        (pl.col("provider") != provider) & (pl.col("human_answer_correct").is_not_null())
    )
    df_unlabelled = df_ppi.filter(pl.col("model") == model)
    distribution = df_unlabelled.get_column(judge_field_name).value_counts()
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
    Y_hat_unlabelled = df_unlabelled[judge_field_name].to_numpy().astype(float)
    Y = df_labelled[f"human_{field_name}"].to_numpy().astype(float)
    Y_hat = df_labelled[judge_field_name].to_numpy().astype(float)
    return Y, Y_hat, Y_hat_unlabelled


def get_ppi_results(df_ppi: pl.DataFrame, provider: str, model: str, field_name="both_correct"):
    Y, Y_hat, Y_hat_unlabelled = get_ppi_inputs(df_ppi, provider, model, field_name)
    ppi_pointestimate = ppi_mean_pointestimate(Y, Y_hat, Y_hat_unlabelled)
    return ppi_pointestimate


def get_benchmark_results(df_ppi: pl.DataFrame, field_name="both_correct") -> pl.DataFrame:
    results = {
        "provider": [],
        "model": [],
        "score": [],
        "95% CI (±)": [],
    }
    for provider, model in df_ppi.select("provider", "model").unique().iter_rows():
        ppi_point_estimates = []
        for _ in range(10_000):
            ppi_pointestimate = get_ppi_results(df_ppi, provider, model, field_name=field_name)
            ppi_point_estimates.append(ppi_pointestimate[0])
        ppi_ci_lower = np.percentile(ppi_point_estimates, 2.5)
        ppi_ci_upper = np.percentile(ppi_point_estimates, 97.5)
        results["provider"].append(provider)
        results["model"].append(model)
        score = (ppi_ci_upper + ppi_ci_lower) / 2
        results["score"].append((score * 100).round(1))
        spread = (ppi_ci_upper - ppi_ci_lower) / 2
        results["95% CI (±)"].append((np.floor(spread * 100 * 10) + 1) / 10)
    results = pl.DataFrame(results)
    return results


def compute_final_ranks(results_df: pl.DataFrame) -> pl.DataFrame:
    results_df = results_df.with_columns(
        pl.col("score").rank(descending=True).cast(pl.UInt64).alias("rank")
    )
    results_df = results_df.with_columns(
        pl.col("score").sub(pl.col("95% CI (±)")).alias("ppi_ci_lower"),
        pl.col("score").add(pl.col("95% CI (±)")).alias("ppi_ci_upper"),
    )
    rank_spread = (
        results_df.join(results_df, how="cross", suffix="_other")
        .group_by("model")
        .agg(
            (pl.col("ppi_ci_lower_other") > pl.col("ppi_ci_upper"))
            .sum()
            .add(1)
            .alias("best_possible_rank"),
            (pl.col("ppi_ci_upper_other") >= pl.col("ppi_ci_lower"))
            .sum()
            .alias("worst_possible_rank"),
        )
    ).with_columns(
        (
            pl.col("best_possible_rank").cast(pl.String)
            + pl.lit(" <--> ")
            + pl.col("worst_possible_rank").cast(pl.String)
        ).alias("rank_spread")
    )
    return (
        results_df.join(rank_spread, on="model", how="left")
        .sort(by="rank")
        .drop("ppi_ci_lower", "ppi_ci_upper", "best_possible_rank", "worst_possible_rank")
    )


def main(field_name: str, split: str):
    df_ppi = pl.read_ndjson(
        f"hf://datasets/rvienne/layton-eval-ppi/ppi_{split}.jsonl", infer_schema_length=100000
    )
    results_df = get_benchmark_results(df_ppi, field_name=field_name)
    df_final = compute_final_ranks(results_df).select(
        "rank",
        "rank_spread",
        "model",
        "score",
        "95% CI (±)",
        "provider",
    )
    df_final.write_ndjson(f"results_{split}.jsonl")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--field-name", type=str, default="both_correct")
    parser.add_argument("--split", type=str, default="llm")
    args = parser.parse_args()
    main(args.field_name, args.split)
