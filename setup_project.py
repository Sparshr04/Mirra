import os
import sys

def create_directory_structure():
    """
    Creates the project directory structure for the Semantic World Reconstruction pipeline.
    """
    # Define the directory structure
    directories = [
        "data/raw",
        "data/processed",
        "outputs/geometry",
        "outputs/semantics",
        "outputs/final",
        "src",
        "checkpoints",
    ]

    base_path = os.getcwd()
    print(f"Setting up project in: {base_path}")

    for directory in directories:
        dir_path = os.path.join(base_path, directory)
        try:
            os.makedirs(dir_path, exist_ok=True)
            print(f"Created/Verified: {directory}")
        except OSError as e:
            print(f"Error creating {directory}: {e}")
            sys.exit(1)

    # Create empty __init__.py in src to make it a package
    init_file = os.path.join(base_path, "src", "__init__.py")
    if not os.path.exists(init_file):
        try:
            with open(init_file, "w") as f:
                pass
            print("Created: src/__init__.py")
        except OSError as e:
            print(f"Error creating {init_file}: {e}")

    print("\nProject structure setup complete!")

if __name__ == "__main__":
    create_directory_structure()
