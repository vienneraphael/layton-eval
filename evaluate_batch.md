# Compute performance using a supported Batch API

> [!IMPORTANT]
> Based on the model provider you will use, make sure to put the correct API key in a `.env` file at the root of the `layton-eval` repo.

## Prepare the predictions batch
Let's prepare the predictions batch.

Run the following `generate_raw_file.sh` script to create the raw file:
```bash
./scripts/prepare_benchmark_batch.sh --split your-split --hints your-hints --max-tokens your-max-tokens --provider your-provider --model your-model
```

The parameters can take the following values:
- `split`: either `llm` or `vlm` depending on the sub-benchmark you want to evaluate your model.
- `hints`: integer between 0-4. Determines the number of hint (if available) your model will have access to in its context.
- `max-tokens`: optional integer, used for anthropic models, which require this to be set in requests. Some models might need it not to fail generating valid JSON.
- `provider`: provider you want to use. Supported providers are:
    - OpenAI
    - Gemini
    - Anthropic
    - Mistral
    - Together
    - Groq
- `model`: model name you want to evaluate within the given provider.

The command output should be a terminal card showing several informations about your batch. Copy-paste the batch name for later use

After having run the script, you can inspect the file created in the `processed_files/` folder, make sure it is consistent with what you want to do.

## Run the batch

Once you're ready, you can send the batch using the `batchling` CLI:
```bash
batchling start your-batch-name
```

Your batch is now sent to the provider. You can monitor its progress and status using:
```bash
batchling get your-batch-name
```

If you want to monitor the batch status use:
```bash
watch -n 2 batchling get your-batch-name
```

> [!NOTE]  
> Batch APIs have SLA of 24 hours, which means you can be sure your batch will be ready in 24 hours at most. It's usually processed way faster than that.

## Retrieve results
Once the batch status indicates it is over, we will retrieve results using:
```bash
batchling results your-batch-name
```

The terminal output should show a path where results were downloaded as a `.jsonl` file.

## Run the jury batch

> [!IMPORTANT]  
> At this step, make sure you have also the relevant API keys (mistral, openai, gemini, anthropic) in order to run the judges!

Run the following command, to prepare the jury batch:
```bash
./scripts/prepare_jury_batch.sh --results-file-path results/your-results-file.jsonl
```
You should see the 3 judge batches that were created, each of them will be sent to a different provider to assess the correctness of the model.

For each judge batch in the terminal output, run:
```bash
batchling start judge-batch-name
```

You can check each judge batch status using:
```bash
batchling get judge-batch-name
```

Similarly to before, you can monitor each judge with:
```bash
watch -n 2 batchling get judge-batch-name
```

### Retrieving jury results

Once all judges are done, retrieve results for each of them using:
```bash
batchling results judge-batch-name
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
