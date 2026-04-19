# Research AI

This repository contains a full-stack application for AI research, focusing on advanced text processing techniques such as late chunking and embeddings. The project is built using modern web technologies and containerized for easy deployment.

## Features

- **Late Chunking**: Implements advanced chunking strategies for text processing.
- **Embeddings**: Uses sentence transformers for generating text embeddings.
- **API Backend**: Built with FastAPI for high-performance API endpoints.
- **Frontend**: React-based user interface with Vite for fast development.
- **Containerization**: Docker Compose setup for easy local development and deployment.

## Architecture

- **Backend** (`backend/`): Python application with FastAPI, including routers for chunking and embedding, and services for parsing and model handling.
- **Frontend** (`frontend/`): TypeScript React application with components for displaying results, settings, and strategy parameters.
- **Docker**: Multi-container setup with separate services for backend and frontend.

## Prerequisites

- Docker and Docker Compose
- GitHub CLI (optional, for repository creation)

## Setup and Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/research_ai.git
   cd research_ai
   ```

2. **Run with Docker Compose**:
   ```bash
   docker-compose up --build
   ```

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000

## Usage

- Upload documents or input text through the frontend interface.
- Configure chunking strategies and embedding parameters.
- View processed results and embeddings.

## Development

- Backend: Python 3.9+, dependencies in `backend/requirements.txt`
- Frontend: Node.js, dependencies in `frontend/package.json`

To run in development mode:
- Backend: `cd backend && python -m uvicorn app.main:app --reload`
- Frontend: `cd frontend && npm run dev`

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Make your changes and test.
4. Submit a pull request.

## License

This project is licensed under the MIT License.

## Hugging face token 
docker compose run --rm -e HF_TOKEN=hf_you_token model-downloader