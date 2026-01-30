#!/usr/bin/env python3
"""Verify pipeline implementation completeness."""

from pathlib import Path
import sys

def check_file(path: Path, required: bool = True) -> bool:
    """Check if file exists."""
    exists = path.exists()
    status = "✅" if exists else ("❌" if required else "⚠️")
    req_str = "(required)" if required else "(optional)"
    print(f"{status} {path} {req_str}")
    return exists or not required

def main():
    """Run verification checks."""
    base = Path("/Users/joe/GitHub/dnd/scripts/audio")
    pipeline = base / "pipeline"
    
    print("=" * 60)
    print("PIPELINE IMPLEMENTATION VERIFICATION")
    print("=" * 60)
    
    all_good = True
    
    # Core files
    print("\n📦 Core Infrastructure:")
    all_good &= check_file(pipeline / "__init__.py")
    all_good &= check_file(pipeline / "config.py")
    all_good &= check_file(pipeline / "orchestrator.py")
    all_good &= check_file(base / "pipeline.config.toml")
    
    # Common utilities
    print("\n🔧 Common Utilities:")
    all_good &= check_file(pipeline / "common" / "__init__.py")
    all_good &= check_file(pipeline / "common" / "audio_utils.py")
    all_good &= check_file(pipeline / "common" / "file_utils.py")
    all_good &= check_file(pipeline / "common" / "logging_utils.py")
    all_good &= check_file(pipeline / "common" / "azure_utils.py")
    
    # Step 0
    print("\n0️⃣ Step 0: Preprocess:")
    all_good &= check_file(pipeline / "preprocess" / "__init__.py")
    all_good &= check_file(pipeline / "preprocess" / "normalize.py")
    all_good &= check_file(pipeline / "preprocess" / "README.md")
    
    # Step 1
    print("\n1️⃣ Step 1: Transcription:")
    all_good &= check_file(pipeline / "transcription" / "__init__.py")
    all_good &= check_file(pipeline / "transcription" / "transcribe.py")
    check_file(pipeline / "transcription" / "README.md", required=False)
    
    # Steps 2-5 (stubs)
    print("\n2️⃣ Step 2: Diarization (stub):")
    all_good &= check_file(pipeline / "diarization" / "__init__.py")
    
    print("\n3️⃣ Step 3: Emotion (stub):")
    all_good &= check_file(pipeline / "emotion" / "__init__.py")
    
    print("\n4️⃣ Step 4: Speaker Embeddings (stub):")
    all_good &= check_file(pipeline / "speaker_embedding" / "__init__.py")
    
    print("\n5️⃣ Step 5: Post-processing (stub):")
    all_good &= check_file(pipeline / "postprocess" / "__init__.py")
    
    # Speaker DB
    print("\n💾 Speaker Database:")
    all_good &= check_file(base / "speaker_db" / "embeddings.json")
    all_good &= check_file(base / "speaker_db" / "README.md")
    
    # Documentation
    print("\n📚 Documentation:")
    all_good &= check_file(base / "QUICK-START.md")
    all_good &= check_file(base / "README-PIPELINE.md")
    all_good &= check_file(base / "IMPLEMENTATION-SUMMARY.md")
    all_good &= check_file(base / "PIPELINE-PLAN.md")
    
    # Summary
    print("\n" + "=" * 60)
    if all_good:
        print("✅ ALL REQUIRED FILES PRESENT")
        print("=" * 60)
        print("\n🎉 Pipeline implementation verified successfully!")
        print("\n📖 Next steps:")
        print("   1. Read QUICK-START.md for usage instructions")
        print("   2. Test Steps 0-1 on sample audio")
        print("   3. Implement Steps 2-5 following PIPELINE-PLAN.md")
        return 0
    else:
        print("❌ SOME REQUIRED FILES MISSING")
        print("=" * 60)
        return 1

if __name__ == "__main__":
    sys.exit(main())
