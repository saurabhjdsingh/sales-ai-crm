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
   # 1. Update Allowed Hosts to permit your server's IP address or domain
   DJANGO_ALLOWED_HOSTS=*

   # 2. Update frontend and backend URLs to point to your server's public IP address
   FRONTEND_URL=http://<YOUR_SERVER_IP>:4200
   BACKEND_URL=http://<YOUR_SERVER_IP>:8000

   # 3. Add your LLM keys
   ANTHROPIC_API_KEY=your-anthropic-key
   OPENAI_API_KEY=your-openai-key
   ```

### 3. Spin Up the CRM
Start the entire stack in the background using Docker Compose:
```bash
docker compose up -d --build
```
This command automatically:
- Builds the frontend and backend Docker containers.
- Spins up PostgreSQL and Redis.
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
