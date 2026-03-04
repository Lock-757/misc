
import os
import shutil

def batch_rename_files(directory, old_pattern, new_pattern):
    """
    Rename multiple files in a directory by replacing an old pattern with a new one.
    Args:
        directory (str): Path to the directory containing files.
        old_pattern (str): Pattern to replace in filenames.
        new_pattern (str): New pattern to insert into filenames.
    Returns:
        int: Number of files renamed.
    """
    count = 0
    for filename in os.listdir(directory):
        if old_pattern in filename:
            new_filename = filename.replace(old_pattern, new_pattern)
            os.rename(os.path.join(directory, filename), os.path.join(directory, new_filename))
            count += 1
    return count

def move_files_by_extension(directory, target_dir, extension):
    """
    Move files with a specific extension from one directory to another.
    Args:
        directory (str): Source directory.
        target_dir (str): Destination directory.
        extension (str): File extension to filter (e.g., '.txt').
    Returns:
        int: Number of files moved.
    """
    if not os.path.exists(target_dir):
        os.makedirs(target_dir)
    count = 0
    for filename in os.listdir(directory):
        if filename.endswith(extension):
            shutil.move(os.path.join(directory, filename), os.path.join(target_dir, filename))
            count += 1
    return count

def delete_files_by_pattern(directory, pattern):
    """
    Delete files in a directory that match a specific pattern.
    Args:
        directory (str): Path to the directory containing files.
        pattern (str): Pattern to match in filenames for deletion.
    Returns:
        int: Number of files deleted.
    """
    count = 0
    for filename in os.listdir(directory):
        if pattern in filename:
            file_path = os.path.join(directory, filename)
            if os.path.isfile(file_path):
                os.remove(file_path)
                count += 1
    return count

if __name__ == "__main__":
    # Example usage
    print("Utility script for file management.")
    # Uncomment to test
    # renamed = batch_rename_files("/app/test_dir", "old", "new")
    # print(f"Renamed {renamed} files.")
    # moved = move_files_by_extension("/app/test_dir", "/app/target_dir", ".txt")
    # print(f"Moved {moved} files.")
    # deleted = delete_files_by_pattern("/app/test_dir", "temp")
    # print(f"Deleted {deleted} files.")
