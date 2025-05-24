# Layton-eval: Asking LLMs and VLMs to solve Professor Layton's puzzles

Welcome to the repository! Our aim with this project is to create a benchmark which measures LLM/VLM performance on Pr. Layton riddles and having it open-sourced.

# Riddle types

This schema explains how we will categorize riddles for the project:

![Project structure](./docs/layton-eval-structure.png)

Here's a textual breakdown:

## Game engine

We will focus on riddles that **do not** require running the game to verify. That means that we will only consider riddles having a solution that can be represented as text.

We'll call `output_type` the variable indicating whether a riddle is a textual one or not.

## Riddle adaptation

Some riddles, if adapted, can have their output represented as text.

The `output_type` variable will have three possible values:
- `text-ready` if the riddle is usable as-is
- `text-adaptable` if the riddle is not usable as-is but can be adapted to be textual
- `action` if the riddle requires running the game to verify.

## Input image

All riddles come with an input image, but not all image inputs are required or useful to solve the riddle.

For this reason, we will differentiate riddles for which the input image is necessary to solve it.

All riddles that do not require input image will be classified using the variable `input_type = LLM-solvable`

## Multimodal riddles

The leftover multimodal input riddles will be again classified:
- if the image input cannot be adapted as text, we will tag them as `input_type = VLM-solvable` only.
- if the image input can be adapted to textual, we will tag them as `input_type = [VLM-solvable, LLM-solvable]` to account for the fact that we could feed them to both type of models.


# Project milestones

The project will be divided into 3 phases:

## V0

### Structured output generation
use a structured generation pipeline to ask a model about:
- `output_type`
- `input_type`
- `answer` (if applicable)

### Watermarking?

### Human verification interface
verify auto-annotation by hosting a Gradio interface on HF and manually review riddle annotations.

### sub-datasets creation
from the curated gold data, generate two data splits:
- `VLM-solvable` riddles
- `LLM-solvable` riddles

### Benchmark run
For the two data splits, run models against those benchmarks with two eval frameworks:
1. LLM-as-judge
2. Structured output benchmark

### Reporting and communication
- report results with nice plots
- communicate on our first results

### Repo cleanup
- clean the repo and make it reproducible end-to-end

## V1

### Enrich dataset with `text-adapt` riddles

Include those riddles with a LLM pipeline + human review cycle.

### add LLM-adaptable input_type
Use VLMs to describe the input image as text and add human review on top of that.

### Out-of-Distribution data

If applicable, create a subset of riddles that can be regenerated with new values to ensure models are not overfitted on that data.

## V2

### Multilingual support
Add other languages available on the wiki
