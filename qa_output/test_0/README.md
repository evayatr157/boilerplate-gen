# Node.js TypeScript MongoDB Starter Kit

This starter kit provides a minimal setup for a Node.js application using TypeScript, Express, and MongoDB with Mongoose.

## Setup Instructions

1. **Install Dependencies for Setup Script**

   ```bash
   npm install
   ```

2. **Run the Setup Script**

   This script will create a `.env` file based on the `.env.example` and install necessary dependencies.

   ```bash
   npm run setup
   ```

3. **Running the Application**

   Use Docker to run the application with MongoDB:

   ```bash
   docker-compose up
   ```

   The application will be accessible at `http://localhost:3000`.
