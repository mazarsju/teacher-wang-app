"""Generate this week's HSK reading articles (ECS scheduled task entrypoint).

Run from the repo / image root:

    python3 -m backend.jobs.generate_weekly_articles
"""

from backend import create_app
from backend.utils.generateArticle.service import run_weekly_article_generation


def main() -> None:
    app = create_app()
    with app.app_context():
        result = run_weekly_article_generation()
    print(result, flush=True)


if __name__ == "__main__":
    main()
