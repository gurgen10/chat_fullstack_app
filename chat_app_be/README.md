# Chat Application Backend

A NestJS-based backend for a chat application with user authentication, room management, and messaging features.

## Features

### Authentication
- User registration and login with email/password
- JWT-based authentication with access and refresh tokens
- Persistent login across browser sessions
- Password change for authenticated users
- Password reset via email
- Secure logout

### User Management
- Account deletion with proper data cleanup
- User profile management

### Security
- Passwords hashed with bcrypt
- JWT tokens with configurable expiration
- Input validation with class-validator

## API Endpoints

### Authentication
- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login with email and password
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout (requires authentication)
- `POST /auth/change-password` - Change password (requires authentication)
- `POST /auth/request-password-reset` - Request password reset
- `POST /auth/reset-password` - Reset password with token

### Users
- `GET /users/me` - Get current user profile (requires authentication)
- `PATCH /users/me` - Update user profile (requires authentication)
- `DELETE /users/me` - Delete account (requires authentication)
- `GET /users/:id` - Get user by ID

## Project Setup

```bash
# Install dependencies
$ npm install

# Start PostgreSQL database
$ docker-compose up -d

# Run database migrations
$ npx prisma migrate dev

# Generate Prisma client
$ npx prisma generate

# Start development server
$ npm run start:dev
```

## Environment Variables

Create a `.env` file with:
```
JWT_SECRET=your-secret-key
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat_app"
```

## Database Schema

The application uses PostgreSQL with Prisma ORM. Key models:
- User: Authentication and profile data
- Room: Chat rooms (public, private, DM)
- RoomMember: Room membership and roles
- Message: Chat messages
- Attachment: File attachments
- Friendship: User relationships

## Testing

```bash
# Run tests
$ npm test

# Run linting
$ npm run lint
```
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
