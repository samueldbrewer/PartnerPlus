from cryptography.fernet import Fernet

# Generate a Fernet key
key = Fernet.generate_key()
print(f"Generated Fernet Key: {key.decode()}")
print("\nAdd this key to your .env file as ENCRYPTION_KEY=<key>")