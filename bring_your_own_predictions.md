# Bring you own predictions

## Run your predictions

If you want to duplicate the system prompt for your own predictions, you can find it in `./prompts/benchmark/`.

## Run the jury

You can find the judge system prompt in `./prompts/benchmark_judge/`.

When running the jury, you should make sure your jury has 3 judges and excludes judges from the provider you chosed to avoid self-preference bias and family bias.

The output format should be three different `.jsonl` files with the following structure:
```json
{
    "custom_id": "the riddle ID",
    "answer": "string representing the judge output, should be valid JSON respecting the judge output schema",
    "model": "the name of the model used as judge"
}
```

As a reminder, the judge output schema is the following:

```json
{
    "is_answer_correct": "boolean, whether the answer is correct or not.",
    "is_justification_correct": "boolean, whether the justification is correct or not"
}
```

## Compute your eval score
Now that you have your model predictions along the jury judgements on those predictions, let's get the final score obtained by your model.

Run the following script to get the final score:

```bash
python src/layton_eval/get_model_performance --judge-files space-separated-judge-results-files
```
You can use the optional parameter `--field-name` to override the default (`both_correct`) field to another one, possible values are:
- `is_answer_correct`: only consider answer correctness, regardless of justification
- `is_justification_correct`: only consider justification correctness, regardless of answer
- `both_correct`: default, consider both answer and justification.

> [!NOTE]  
> The --judges-file param value can be auto-generated using a wildcard pattern (*) on the file paths.

The console should print out a dictionary containing two fields:
- `score`: the score obtained by the model you evaluated
- `95% CI (±)`: the 95% CI interval demi-width.
