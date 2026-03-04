
#!/usr/bin/env python3
import os
import shutil
from pathlib import Path

def organize_files(directory):
    """
    Organize files in the specified directory into project-specific folders based on file type or content.
    - Python files (*.py) go to 'code'
    - Test files (containing 'test' in name) go to 'tests'
    - Task-related files (containing 'task' in name or .json files) go to 'tasks'
    - Other files are organized by extension as a fallback
    """
    target_dir = Path(directory)
    if not target_dir.exists() or not target_dir.is_dir():
        print(f"Error: {directory} does not exist or is not a directory.")
        return

    for item in target_dir.iterdir():
        if item.is_file():
            file_name = item.name.lower()
            moved = False

            # Project-specific categorization
            if file_name.endswith('.py'):
                dest_folder = target_dir / 'code'
                dest_folder.mkdir(exist_ok=True)
                new_path = dest_folder / item.name
                try:
                    shutil.move(str(item), str(new_path))
                    print(f"Moved: {item.name} -> {new_path} (as code file)")
                    moved = True
                except Exception as e:
                    print(f"Error moving {item.name}: {e}")
            elif 'test' in file_name:
                dest_folder = target_dir / 'tests'
                dest_folder.mkdir(exist_ok=True)
                new_path = dest_folder / item.name
                try:
                    shutil.move(str(item), str(new_path))
                    print(f"Moved: {item.name} -> {new_path} (as test file)")
                    moved = True
                except Exception as e:
                    print(f"Error moving {item.name}: {e}")
            elif 'task' in file_name or file_name.endswith('.json'):
                dest_folder = target_dir / 'tasks'
                dest_folder.mkdir(exist_ok=True)
                new_path = dest_folder / item.name
                try:
                    shutil.move(str(item), str(new_path))
                    print(f"Moved: {item.name} -> {new_path} (as task file)")
                    moved = True
                except Exception as e:
                    print(f"Error moving {item.name}: {e}")

            # Fallback to extension-based organization if not moved yet
            if not moved:
                ext = item.suffix.lower()
                if ext:
                    ext_folder = target_dir / ext[1:]  # Remove the dot from extension
                    ext_folder.mkdir(exist_ok=True)
                    new_path = ext_folder / item.name
                    try:
                        shutil.move(str(item), str(new_path))
                        print(f"Moved: {item.name} -> {new_path} (by extension)")
                    except Exception as e:
                        print(f"Error moving {item.name}: {e}")
                else:
                    no_ext_folder = target_dir / "no_extension"
                    no_ext_folder.mkdir(exist_ok=True)
                    new_path = no_ext_folder / item.name
                    try:
                        shutil.move(str(item), str(new_path))
                        print(f"Moved: {item.name} -> {new_path} (no extension)")
                    except Exception as e:
                        print(f"Error moving {item.name}: {e}")

if __name__ == "__main__":
    # Use current directory as default
    dir_to_organize = input("Enter directory to organize (default: current directory): ") or "."
    organize_files(dir_to_organize)
