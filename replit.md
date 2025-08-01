# Telnyx Softphone Application

## Overview

This is a full-stack Telnyx softphone application built with React, Express, and TypeScript. The application provides a desktop-ready softphone interface for making and receiving **real phone calls** through the Telnyx Call Control API without WebRTC dependencies. It features WebSocket audio streaming for desktop applications, a modern UI built with shadcn/ui components, uses in-memory storage for development, and integrates the Telnyx API for live calling functionality optimized for Electron deployment.

## Recent Changes (Latest)

- **Official Telnyx WebSocket Media Streaming**: Replaced custom RTP implementation with official Telnyx WebSocket Media Streaming API
- **Telnyx Media Handler**: Created comprehensive server-side handler implementing official Telnyx media streaming protocol
- **WebSocket Media Integration**: Built proper WebSocket connection handling for bidirectional audio streaming with base64-encoded payloads
- **Client Media Hook**: Implemented useTelnyxMedia hook following official Telnyx streaming specifications
- **Production-Ready Audio**: Integrated official Telnyx streaming with supported codecs (PCMU, PCMA, G722, OPUS, AMR-WB)
- **Real-time Media Events**: Added proper handling for start/stop/media/error/DTMF events per Telnyx documentation
- **Audio Interface Enhancement**: Updated call interface to show official Telnyx streaming status and audio levels
- **Reliable Audio Solution**: Moved to production-ready Telnyx WebSocket streaming for consistent audio performance

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: React Context API with TanStack Query for server state
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **WebRTC**: Telnyx WebRTC SDK for voice communication

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API**: RESTful endpoints with WebSocket support for real-time updates
- **Session Management**: Express sessions with PostgreSQL store
- **Error Handling**: Centralized error handling middleware

### Data Storage
- **Database**: PostgreSQL (configured for Neon serverless)
- **ORM**: Drizzle ORM with TypeScript-first schema definitions
- **Migrations**: Drizzle Kit for schema migrations
- **In-Memory Fallback**: Memory storage implementation for development

## Key Components

### Database Schema
- **Users Table**: Authentication and user management
- **Calls Table**: Call history and state tracking
- **Telnyx Config Table**: API credentials and configuration storage

### Frontend Components
- **Softphone Page**: Main application interface with tabbed navigation
- **Dialer**: Phone number input and call initiation
- **Call Interface**: Active call controls (mute, hold, transfer, conference)
- **Active Calls**: List of ongoing calls with management controls
- **Settings**: Telnyx configuration management
- **Connection Status**: Real-time connection indicator

### Backend Services
- **Storage Layer**: Abstracted storage interface with memory and database implementations
- **Route Handlers**: RESTful API endpoints for calls and configuration
- **WebSocket Server**: Real-time call state synchronization

## Data Flow

1. **Call Initiation**: User enters phone number → Frontend validates → API creates call record → Telnyx WebRTC initiates call
2. **Call Management**: UI controls → Context state updates → API calls → Database persistence → WebSocket broadcasts
3. **Real-time Updates**: WebSocket connection maintains call state synchronization across components
4. **Configuration**: Settings form → API validation → Database storage → Context refresh

## External Dependencies

### Core Dependencies
- **@telnyx/webrtc**: WebRTC SDK for voice communication
- **@tanstack/react-query**: Server state management and caching
- **drizzle-orm**: Type-safe database operations
- **@neondatabase/serverless**: PostgreSQL serverless driver
- **wouter**: Lightweight React router

### UI Dependencies
- **@radix-ui/react-***: Accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **lucide-react**: Icon library

### Development Dependencies
- **vite**: Build tool and development server
- **tsx**: TypeScript execution for development
- **esbuild**: Production build optimization

## Deployment Strategy

### Development
- Vite development server with HMR
- Express server with middleware mode
- In-memory storage for rapid prototyping
- Environment-based configuration switching

### Production
- Vite build generates optimized static assets
- esbuild bundles server code for Node.js
- PostgreSQL database with connection pooling
- Environment variables for sensitive configuration

### Build Process
1. **Frontend Build**: `vite build` → Optimized React application in `dist/public`
2. **Backend Build**: `esbuild` → Bundled server code in `dist/index.js`
3. **Database**: `drizzle-kit push` → Schema synchronization
4. **Deployment**: Single Node.js process serving both static files and API

### Configuration Management
- Telnyx credentials pre-configured in memory storage for development
- Environment variables for production database connection
- Graceful fallback from database to memory storage
- Session management with PostgreSQL persistence in production

The application is designed as a monolithic full-stack application with clear separation between client and server code, making it suitable for deployment on platforms like Replit, Heroku, or similar Node.js hosting environments.