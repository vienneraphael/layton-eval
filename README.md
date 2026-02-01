# layton-eval: Asking LLMs and VLMs to solve Professor Layton's riddles

<p align="center">
<a href="https://huggingface.co/collections/rvienne/layton-eval" target="_blank">
    <img src="https://img.shields.io/badge/huggingface-%23FFD21E.svg?style=for-the-badge&logo=huggingface&logoColor=black" alt="HF">
<a href="https://vienneraphael.github.io/layton-eval/" target="_blank">
    <img src="https://img.shields.io/badge/github%20pages-121013?style=for-the-badge&logo=github&logoColor=white" alt="GHP">
<a href="https://www.linkedin.com/in/raphael-vienne/" target="_blank">
    <img src="https://img.shields.io/badge/linkedin-%230077B5.svg?style=for-the-badge&logo=linkedin&logoColor=white" alt="GHP">
</a>
</p>
This repo contains all that you need to independently compute the performance metric for any kind of model on the [layton-eval](https://huggingface.co/datasets/rvienne/layton-eval) eval benchmark dataset.

## Evaluate a model on the benchmark

### Installation

You can install the project using any of the following commands.

Using uv (recommended):

```bash
uv sync
```

Using pip through `pyproject.toml`

```bash
pip install -e .
```

Using pip through `requirements.txt`

```bash
pip install -r requirements.txt
```

### Computing model performance

Predictions can be run in two different ways, depending if you use a Batch API compatible model (using the [`batchling`](https://github.com/vienneraphael/batchling) library I built) from any of those providers:

- OpenAI
- Gemini
- Anthropic
- Mistral
- Together
- Groq

> [!TIP]
> Batch APIs are particularly suited for model evaluation and will likely save you **50% off** your inference costs!

To compute model performance on the benchmark, you can choose to either:

- [Compute performance using a supported Batch API](./evaluate_batch.md)
- [Bring your own predictions](./bring_your_own_predictions.md)

## Evaluation Methodology

In the [`layton-eval`](https://huggingface.co/datasets/rvienne/layton-eval) benchmark, we're evaluating models using a bootstrapped PPI (Prediction-Powered Inference) method.

The following details how that works.

### Predictions Schema

In [`layton-eval`](https://huggingface.co/datasets/rvienne/layton-eval), models are using structured output generation, e.g. models generating valid typed JSON, to generate the following type of JSON:

```json
{
    "answer": str,
    "justification": str
}
```

Since some riddles have a very narrow range of possible answers (like choosing from A, B, C or D), we try to limit false positives of a model having the right answer "by luck" by also asking models to generate a justification for their answer!

The idea is to estimate a metric representing the percentage of the times a model gives a valid answer, meaning the answer is the right one and the justification backing it up also makes sense.

The next section focuses on how we estimate an answer and justification to be correct given that both are free-text.

### LLM-as-Judge

[`layton-eval`](https://huggingface.co/datasets/rvienne/layton-eval) riddles are free text format. For this reason, it is hard to systematically compare predictions to ground truth using standard operators or metrics.

We're relying on the LLM-as-Judge to estimate whether an answer is correct, based on all riddle context:

- description
- ground truth answer
- hints..

We're (again) relying on structured outputs to generate the following schema:

```json
{
    "is_answer_correct": bool,
    "is_justification_correct": bool
}
```

An additional field `both_correct` is obtained through boolean multiplication of the two others.

The next section focuses on an ensembling strategy used to make the judging setup more robust.

### Jury of Judges

One judge might have more variance or be easily fooled by a justification that only looks correct but is not.
For this reason, the [`layton-eval`](https://huggingface.co/datasets/rvienne/layton-eval) benchmark dataset uses a jury of judges for estimating the correctness of evaluated models.

Four judges constitute a panel:

- gpt-5.1-high
- gemini-3-pro-preview-high
- claude-4.5-opus-thinking_32k
- mistral-large-2512

Based on the organization the model we evaluate is from, we remove the same-provider jury from the panel (if none, mistral is removed) to avoid any self-preference bias and family bias.

All judges answers are then averaged into discrete float values:

- `answer_correctness` (either 0.0, 0.33, 0.66 or 1.0)
- `justification_correctness`: (either 0.0, 0.33, 0.66 or 1.0)
- `both_correctness`: (either 0.0, 0.33, 0.66 or 1.0)

### Annotated Samples

During the development of this project, a lot of frontier model predictions (from gpt-5.1, claude-4.5-opus, gemini-3-pro, gemini-3-flash, mistral-large-2512) were manually judged by a human annotator in parallel.

Having both human and a jury judgements on data points allows us to compute the residuals of the jury (how much the jury output is away from the human annotations) on a curated calibration dataset.

### Prediction-Powered Inference (PPI)

Using this curated dataset, we can estimate, knowing the jury output on another dataset, what would the human annotator have done, if he were given these samples.
This extrapolation is essentially done using [Prediction-Powered Inference (PPI)](https://arxiv.org/abs/2301.09633).

In our case, the "unlabelled" dataset on which we try to make this estimation is made of all model predictions on each layton-eval riddle.
The "labelled" dataset on which we compute residuals is called [`layton-eval-ppi`](https://huggingface.co/datasets/rvienne/layton-eval-ppi).

Further pre-processing is applied before computing residuals:

- we filter it to samples having human annotations
- we filter out samples from other models of the same provider

### Bootstrapped PPI

Thanks to the volume of annotations that were made (approx. 3x the benchmark size, ensuring that bootstrap iterations are diverse parallel universes), we actually have more samples on which to compute residuals than to apply them.
Using this property of the data and in order to reduce variance further, we decided to compute PPI in a bootstrapped fashion.
Here's how it works:

- Estimate the jury output distribution for the model we are evaluating by splitting values into bins
- For each bin, sample the same amount from the preprocessed `layton-eval-ppi` dataset, with replacement.
We obtain a dataset with `n_riddles` samples and the same jury output distribution, PPI is computed on this dataset.

This process is repeated 1000 times with a different sampling each time, leading to same-distribution, but different samples.

The 1000 PPIs point estimates are then used to compute a 95%-CI interval, using the 2.5 and 97.5 percentile of the PPI values distribution.
The final score is the mid-value between those two percentiles, such that we can assess with 95% confidence that the model score is somewhere in the [score - CI, score + CI] interval.

At this step, the obtained score represents the metric that anyone can self-report on the benchmark.

### Ranks

Finally, if several models are evaluated, a rank can be determined from scores. Another indicator is derived from the CI-based score, which is the rank spread.
The rank spread represents the best possible and worst possible rank a model can have in the benchmark (at 95% certainty), by relying on the CI interval obtained above.

The worst possible case is where said model sits at the left-most value of its CI interval while all other sit at the right-most value of their CI interval.
The best possible case is the opposite: said model sits at the right-most value of its CI interval while all other sit at the left-most value of their CI interval.
