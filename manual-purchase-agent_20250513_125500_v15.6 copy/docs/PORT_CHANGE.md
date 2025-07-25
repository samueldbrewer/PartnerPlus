# Port Change Documentation

As requested, all port references have been changed from `5000` to `7777` in the following files:

1. `Dockerfile`:
   - Changed EXPOSE directive from 5000 to 7777
   - Updated gunicorn bind address from 0.0.0.0:5000 to 0.0.0.0:7777

2. `docker-compose.yml`:
   - Changed port mapping from 5000:5000 to 7777:7777

3. `app.py`:
   - Updated default port for the Flask development server from 5000 to 7777

4. `README.md`:
   - Updated the application URL from http://localhost:5000 to http://localhost:7777

5. `CLAUDE.md`:
   - Updated the gunicorn command example to use port 7777

These changes ensure that the application will consistently listen on port 7777 instead of port 5000 in all deployment scenarios, including Docker containers and local development.

To apply these changes:
- For Docker: rebuild your containers with `docker-compose up -d --build`
- For local development: the application will automatically use the new port

The database port (5432) remains unchanged as it's a standard PostgreSQL port and only accessed internally.