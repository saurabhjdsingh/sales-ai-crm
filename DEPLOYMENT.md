# Sales AI CRM - Ubuntu Deployment Guide

This guide provides step-by-step instructions for deploying the Sales AI CRM repository on a remote Ubuntu server using Docker Compose.

---

## 🚀 Quick Start (Production)

Once you copy the files or clone the repository to your Ubuntu server, follow these quick steps:

### 1. Prerequisites
Ensure Docker and Docker Compose are installed on your server:
```bash
# Update package index
sudo apt update

# Install Docker
sudo apt install -y docker.io docker-compose-v2

# Add your user to the docker group (optional, to run docker without sudo)
sudo usermod -aG docker $USER
```
*Note: Log out and log back in to apply the docker group changes.*

### 2. Configure Environment Variables
1. Copy the example environment template to `.env` inside the `backend` directory:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Open `backend/.env` (e.g. `nano backend/.env`) and update the key variables for your server deployment:
   ```env
   # 1. Enable Production Settings and disable debug
   DJANGO_SETTINGS_MODULE=config.settings.prod
   DJANGO_DEBUG=False

   # 2. Update Allowed Hosts to permit your server's IP address or domain
   DJANGO_ALLOWED_HOSTS=*

   # 3. Update frontend and backend URLs to point to your server's public IP address
   FRONTEND_URL=http://<YOUR_SERVER_IP>:4200
   BACKEND_URL=http://<YOUR_SERVER_IP>:8000

   # 4. Configure Production Cloud Database (e.g., Neon, Supabase, AWS RDS)
   # Setting DATABASE_URL will override individual local database host configurations
   DATABASE_URL=postgres://<username>:<password>@<host>:<port>/<dbname>
   DB_SSL_MODE=require

   # 5. Configure Production AWS S3 Media File Storage (Optional)
   # If configured, the app will automatically store media assets in your S3 bucket
   AWS_ACCESS_KEY_ID=your-aws-access-key-id
   AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
   AWS_STORAGE_BUCKET_NAME=your-s3-bucket-name
   AWS_S3_REGION_NAME=us-east-1
   # Optional custom endpoint (for Cloudflare R2 / DigitalOcean Spaces / MinIO)
   # AWS_S3_ENDPOINT_URL=https://s3.us-east-1.amazonaws.com
   # AWS_S3_CUSTOM_DOMAIN=your-cdn-or-cloudfront-domain.com

   # 6. Add your LLM keys
   BOARD_KEY=your-other-keys
   ANTHROPIC_API_KEY=your-anthropic-key
   OPENAI_API_KEY=your-openai-key
   ```

### 2.5 Database Connection Note
If you are hosting your database on a cloud provider (e.g. AWS RDS, Neon, Supabase) and have configured `DATABASE_URL` in `backend/.env`, Django will automatically connect directly to your cloud database. The local PostgreSQL container will still spin up in the background but will remain completely unused by the application.

### 3. Spin Up the CRM
By default, the Docker image builds using the development dependencies (`requirements/dev.txt`). For production deployments, you **must** build using production requirements (`requirements/prod.txt`) so that `django-storages`, `boto3`, and `sentry-sdk` are installed.

To do this:
* **Option A (Persistent):** Open `docker-compose.yml` and uncomment the `args` block under the `build` sections for `backend`, `celery`, and `celery-beat`. E.g.:
  ```yaml
  build:
    context: ./backend
    dockerfile: Dockerfile
    args:
      - REQUIREMENTS_FILE=requirements/prod.txt
  ```
* **Option B (Ad-hoc command line):** Run the build command with the argument manually:
  ```bash
  docker compose build --build-arg REQUIREMENTS_FILE=requirements/prod.txt
  docker compose up -d
  ```

Otherwise, spin up the entire stack in the background:
```bash
docker compose up -d --build
```
This command automatically:
- Builds the frontend and backend Docker containers.
- Spins up PostgreSQL (if not disabled) and Redis.
- Runs all Django database migrations automatically.
- Launches Celery workers and the Celery Beat scheduler.
- Starts serving the Angular frontend on port `4200` and the API on port `8000`.

### 4. Access the CRM
Open your browser and navigate to:
```
http://<YOUR_SERVER_IP>:4200
```

---

## 🛠️ Deployment Features

- **Automatic Migrations**: The backend container checks for new database migrations and runs `python manage.py migrate` automatically on startup before starting the server.
- **Dynamic API Routing**: The Angular frontend automatically detects the server's host IP/domain and routes API calls to port `8000` dynamically.
- **Branded & Encrypted Emails**: Once you configure SMTP in the settings panel (under **SMTP Integration**), invite and task reminder emails will be sent out using the saved database credentials. Passwords are encrypted on-disk using Django's secret key wrapper.
- **Git Ready**: Root, frontend, and backend folders are configured with `.gitignore` files to prevent caching, local files, and `.env` credentials from being checked into source control.
