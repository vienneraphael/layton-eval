#!/bin/bash

# Grid search for all parameter combinations
# splits: vlm, llm
# max_tokens: false, true
# hints: 0, 1, 2, 3, 4

for split in "vlm" "llm"; do
    for max_tokens in false true; do
        for hints in 0 1 2 3 4; do
            echo "Running: split=$split, max_tokens=$max_tokens, hints=$hints"

            if [ "$max_tokens" = "true" ]; then
                python src/layton_eval/benchmark/generate_raw_file.py \
                    --split "$split" \
                    --max-tokens \
                    --hints "$hints"
            else
                python src/layton_eval/benchmark/generate_raw_file.py \
                    --split "$split" \
                    --hints "$hints"
            fi
        done
    done
done

echo "All batch input files generated!"
