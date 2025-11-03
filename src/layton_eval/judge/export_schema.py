import json

from pydantic import BaseModel, Field

from layton_eval.settings import settings


class JustificationJudgement(BaseModel):
    is_correct: bool = Field(
        description="Whether the justification is the one that solves the riddle or not."
    )


if __name__ == "__main__":
    schema = JustificationJudgement.model_json_schema()
    full_schema = {
        "type": "json_schema",
        "json_schema": {
            "schema": schema,
            "name": JustificationJudgement.__name__,
            "strict": True,
        },
    }
    with open(settings.root_dir / "json_schemas" / "justification_judgement_schema.json", "w") as f:
        json.dump(full_schema, f, indent=4)
