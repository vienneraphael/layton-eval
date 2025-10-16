import json

from pydantic import BaseModel, Field

from layton_eval.settings import settings


class Justification(BaseModel):
    justification: str = Field(description="The justification for the answer.")


if __name__ == "__main__":
    schema = Justification.model_json_schema()
    with open(settings.root_dir / "json_schemas" / "justification_schema.json", "w") as f:
        json.dump(schema, f, indent=4)
