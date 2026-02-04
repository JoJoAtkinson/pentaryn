"""Step 3: Emotion Analysis"""

__all__ = ["EmotionAnalyzer", "derive_emotion_label"]


def __getattr__(name: str):
    if name in __all__:
        from .analyze import EmotionAnalyzer, derive_emotion_label
        return {"EmotionAnalyzer": EmotionAnalyzer, "derive_emotion_label": derive_emotion_label}[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
