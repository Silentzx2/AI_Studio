from app.config import Settings


def test_debug_accepts_release_strings():
    settings = Settings(debug="release")
    assert settings.debug is False


def test_debug_accepts_development_strings():
    settings = Settings(debug="development")
    assert settings.debug is True
