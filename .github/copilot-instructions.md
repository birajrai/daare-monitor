# Project Guidelines

## Code Style

- **Language**: JavaScript (Node.js)
- **Formatting**: Follow the patterns in [routes/index.js](routes/index.js) and [services/database.js](services/database.js).
- **Linting**: Use ESLint with the configuration specified in `package.json`.

## Architecture

- **Major Components**:
    - `routes/`: Defines API endpoints.
    - `services/`: Contains business logic and utility functions.
    - `views/`: EJS templates for rendering HTML.
    - `public/`: Static assets like CSS and images.
- **Data Flow**: Routes call services, which interact with the database or other external systems.
- **Structure**: Modularized by feature (e.g., `admin`, `status`).

## Build and Test

- **Install Dependencies**: `npm install`
- **Run the Application**: `node app.js`
- **Test**: No explicit test scripts found. Add tests in a `tests/` directory if needed.

## Project Conventions

- **Routing**: Use `routes/` to define endpoints. Example: [routes/admin.js](routes/admin.js).
- **Services**: Encapsulate logic in `services/`. Example: [services/notifier.js](services/notifier.js).
- **Views**: Use EJS templates in `views/`. Example: [views/layout.ejs](views/layout.ejs).

## Integration Points

- **Database**: Managed in [services/database.js](services/database.js).
- **Scheduler**: Background tasks in [services/scheduler.js](services/scheduler.js).
- **Notifier**: Notification logic in [services/notifier.js](services/notifier.js).

## Security

- **Sensitive Data**: Avoid hardcoding credentials. Use environment variables.
- **Authentication**: Implement authentication in `routes/admin.js` if required.

---

Feel free to update this document as the project evolves.
