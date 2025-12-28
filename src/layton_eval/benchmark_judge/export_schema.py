import json

from pydantic import BaseModel, Field

from layton_eval.settings import settings


class BenchmarkJudgement(BaseModel):
    is_answer_correct: bool = Field(description="Whether the answer is correct or not.")
    is_justification_correct: bool = Field(
        description="Whether the justification is correct or not."
    )

if __name__ == "__main__":
    schema = BenchmarkJudgement.model_json_schema()
    schema["additionalProperties"] = False
    full_schema = {
        "type": "json_schema",
        "json_schema": {
            "schema": schema,
            "name": BenchmarkJudgement.__name__,
            "strict": True,
        },
    }
    with open(settings.root_dir / "json_schemas" / "benchmark_judgement_schema.json", "w") as f:
        json.dump(full_schema, f, indent=4)
