#!/usr/bin/env python3
"""
Convert D&D session transcripts (JSONL format) into narrative story format.

This script:
1. Reads JSONL transcript files with speaker labels
2. Loads context files (campaign lore, character sheets, etc.)
3. Chunks the transcript into manageable sections
4. Uses OpenAI API to convert dialogue to narrative prose
5. Maintains continuity between chunks by passing previous output as context
6. Outputs a complete chapter/story

Usage:
    python transcript_to_story.py <transcript.jsonl> \
        --context world/factions/overview.md characters/player-characters/*.md \
        --overview "Session 1: The party meets at the Wayward Compass" \
        --chunk-size 100 \
        --output sessions/notes/session-01-story.md \
        --api-key YOUR_OPENAI_API_KEY
"""

import argparse
import json
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional
import os

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package not installed. Run: pip install openai")
    sys.exit(1)


class TranscriptToStoryConverter:
    """Convert D&D transcript to narrative story format."""
    
    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o",
        chunk_size: int = 100,
        overlap: int = 10,
        temperature: float = 0.7
    ):
        """
        Initialize the converter.
        
        Args:
            api_key: OpenAI API key
            model: Model to use (gpt-4o, gpt-4-turbo, etc.)
            chunk_size: Number of transcript lines per chunk
            overlap: Number of lines to overlap between chunks for context
            temperature: Model temperature (0.0-1.0)
        """
        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.temperature = temperature
        self.previous_output = ""
        
    def load_transcript(self, filepath: Path) -> List[Dict[str, Any]]:
        """Load JSONL transcript file."""
        transcript = []
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    transcript.append(json.loads(line))
        return transcript
    
    def load_context_files(self, filepaths: List[str]) -> str:
        """Load and concatenate context files."""
        context = []
        for filepath in filepaths:
            path = Path(filepath)
            if path.is_file():
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        context.append(f"=== {path.name} ===\n{content}\n")
                except Exception as e:
                    print(f"Warning: Could not read {filepath}: {e}")
            else:
                print(f"Warning: File not found: {filepath}")
        
        return "\n".join(context)
    
    def chunk_transcript(self, transcript: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """Split transcript into overlapping chunks."""
        chunks = []
        i = 0
        while i < len(transcript):
            chunk_end = min(i + self.chunk_size, len(transcript))
            chunk = transcript[i:chunk_end]
            chunks.append(chunk)
            i += self.chunk_size - self.overlap
            
            # Avoid creating tiny final chunks
            if len(transcript) - i < self.chunk_size // 2:
                break
        
        # Add any remaining lines to the last chunk
        if i < len(transcript):
            chunks[-1].extend(transcript[i:])
        
        return chunks
    
    def format_transcript_chunk(self, chunk: List[Dict[str, Any]]) -> str:
        """Format a transcript chunk as text."""
        lines = []
        for entry in chunk:
            speaker = entry.get('speaker', 'UNKNOWN')
            text = entry.get('text', '')
            lines.append(f"{speaker}: {text}")
        return "\n".join(lines)
    
    def create_system_prompt(self, context: str, overview: str) -> str:
        """Create the system prompt for the LLM."""
        return f"""You are a skilled fantasy novelist converting D&D session transcripts into engaging narrative prose.

CONTEXT:
{context}

SESSION OVERVIEW:
{overview}

YOUR TASK:
Convert the provided transcript into narrative story format following these guidelines:

1. NARRATIVE STYLE:
   - Write in third-person past tense
   - Use descriptive prose for actions, settings, and emotions
   - Quote dialogue directly when it adds character or drama
   - Paraphrase or summarize less important exchanges
   - Maintain the tone and atmosphere of high fantasy D&D

2. SPEAKER INTERPRETATION:
   - DM voices: Describe these as narration, NPC dialogue, or environmental description
   - Player voices: These are the characters speaking/acting in-world
   - Out-of-character moments: Either omit or convert to character thoughts/actions
   - UNKNOWN speakers: Use context clues to infer who's speaking

3. SCENE BUILDING:
   - Begin with scene-setting if this is a new location/situation
   - Include sensory details (sights, sounds, smells)
   - Show character emotions and reactions
   - Maintain pacing - don't rush important moments

4. CONTINUITY:
   - You will receive the previous narrative section as context
   - Continue smoothly from where it left off
   - Maintain consistent character voices and story threads
   - Avoid repeating information already covered

5. FORMAT:
   - Use paragraphs with proper spacing
   - Break up long sections with scene transitions
   - Use italics for emphasis or internal thoughts (if appropriate)
   - Keep the narrative flowing and readable

IMPORTANT: Focus on creating an enjoyable reading experience. Not every line of dialogue needs to appear - be selective and craft a good story."""

    def process_chunk(
        self,
        chunk: List[Dict[str, Any]],
        chunk_number: int,
        total_chunks: int,
        system_prompt: str
    ) -> str:
        """Process a single chunk through the API."""
        chunk_text = self.format_transcript_chunk(chunk)
        
        # Build the user message
        user_message = f"=== TRANSCRIPT CHUNK {chunk_number}/{total_chunks} ===\n\n{chunk_text}"
        
        # Add previous output as context (if exists)
        if self.previous_output:
            user_message = f"=== PREVIOUS NARRATIVE ===\n{self.previous_output[-2000:]}\n\n{user_message}"
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        print(f"Processing chunk {chunk_number}/{total_chunks}...", end=" ", flush=True)
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=4096
            )
            
            output = response.choices[0].message.content
            print("✓")
            return output
            
        except Exception as e:
            print(f"✗ Error: {e}")
            return f"\n\n[Error processing chunk {chunk_number}: {e}]\n\n"
    
    def convert(
        self,
        transcript_path: Path,
        context_files: List[str],
        overview: str,
        output_path: Optional[Path] = None
    ) -> str:
        """
        Convert entire transcript to story format.
        
        Args:
            transcript_path: Path to JSONL transcript file
            context_files: List of context file paths
            overview: Session overview/description
            output_path: Optional path to save output
            
        Returns:
            Complete narrative story as string
        """
        print(f"Loading transcript: {transcript_path}")
        transcript = self.load_transcript(transcript_path)
        print(f"  Loaded {len(transcript)} transcript entries")
        
        print(f"Loading context files: {len(context_files)} files")
        context = self.load_context_files(context_files)
        print(f"  Loaded {len(context)} characters of context")
        
        print(f"Creating chunks (size: {self.chunk_size}, overlap: {self.overlap})")
        chunks = self.chunk_transcript(transcript)
        print(f"  Created {len(chunks)} chunks")
        
        system_prompt = self.create_system_prompt(context, overview)
        
        print("\nProcessing chunks:")
        story_parts = []
        
        for i, chunk in enumerate(chunks, 1):
            output = self.process_chunk(chunk, i, len(chunks), system_prompt)
            story_parts.append(output)
            
            # Update previous output for next iteration
            self.previous_output = output
        
        # Combine all parts
        full_story = "\n\n".join(story_parts)
        
        # Save to file if output path provided
        if output_path:
            print(f"\nSaving to: {output_path}")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                # Add frontmatter
                f.write("---\n")
                f.write(f"title: {overview}\n")
                f.write(f"source_transcript: {transcript_path.name}\n")
                f.write(f"generated_by: transcript_to_story.py\n")
                f.write(f"model: {self.model}\n")
                f.write("---\n\n")
                f.write(f"# {overview}\n\n")
                f.write(full_story)
            print("✓ Complete!")
        
        return full_story


def main():
    parser = argparse.ArgumentParser(
        description="Convert D&D session transcripts to narrative story format",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic usage
  python transcript_to_story.py recordings_transcripts/DnD_1.jsonl \\
      --overview "Session 1: Meeting at the Wayward Compass"
  
  # With context files
  python transcript_to_story.py recordings_transcripts/DnD_1.jsonl \\
      --context world/README.md characters/player-characters/*.md \\
      --overview "Session 1: The party assembles" \\
      --output sessions/notes/session-01-story.md
  
  # Custom chunk size and model
  python transcript_to_story.py recordings_transcripts/DnD_1.jsonl \\
      --chunk-size 150 \\
      --overlap 15 \\
      --model gpt-4-turbo \\
      --overview "Session 1"
        """
    )
    
    parser.add_argument(
        'transcript',
        type=str,
        help='Path to JSONL transcript file'
    )
    
    parser.add_argument(
        '--context',
        nargs='+',
        default=[],
        help='Context files (lore, characters, etc.)'
    )
    
    parser.add_argument(
        '--overview',
        type=str,
        required=True,
        help='Session overview/description'
    )
    
    parser.add_argument(
        '--output',
        type=str,
        help='Output file path (default: print to stdout)'
    )
    
    parser.add_argument(
        '--api-key',
        type=str,
        default=os.environ.get('OPENAI_API_KEY'),
        help='OpenAI API key (or set OPENAI_API_KEY env var)'
    )
    
    parser.add_argument(
        '--model',
        type=str,
        default='gpt-4o',
        help='OpenAI model to use (default: gpt-4o)'
    )
    
    parser.add_argument(
        '--chunk-size',
        type=int,
        default=100,
        help='Number of transcript lines per chunk (default: 100)'
    )
    
    parser.add_argument(
        '--overlap',
        type=int,
        default=10,
        help='Number of lines to overlap between chunks (default: 10)'
    )
    
    parser.add_argument(
        '--temperature',
        type=float,
        default=0.7,
        help='Model temperature 0.0-1.0 (default: 0.7)'
    )
    
    args = parser.parse_args()
    
    # Check API key
    if not args.api_key:
        print("Error: OpenAI API key required. Set OPENAI_API_KEY environment variable or use --api-key")
        sys.exit(1)
    
    # Validate paths
    transcript_path = Path(args.transcript)
    if not transcript_path.exists():
        print(f"Error: Transcript file not found: {transcript_path}")
        sys.exit(1)
    
    output_path = Path(args.output) if args.output else None
    
    # Create converter
    converter = TranscriptToStoryConverter(
        api_key=args.api_key,
        model=args.model,
        chunk_size=args.chunk_size,
        overlap=args.overlap,
        temperature=args.temperature
    )
    
    # Convert
    try:
        story = converter.convert(
            transcript_path=transcript_path,
            context_files=args.context,
            overview=args.overview,
            output_path=output_path
        )
        
        # Print to stdout if no output file specified
        if not output_path:
            print("\n" + "="*80 + "\n")
            print(story)
            
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
