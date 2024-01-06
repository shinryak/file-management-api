#!/usr/bin/env node

/**
 * Module dependencies.
 */
require('dotenv').config() // Must be the first import
const debug = require('debug')('file:server')
const http = require('http')
const { logger } = require('../helpers/logger')

// Port Setup
const port = normalizePort(process.env.PORT || '5051')

// Normalize a port into a number, string, or false.
function normalizePort(val: any) {
	const port = parseInt(val, 10)
	// named pipe
	if (isNaN(port)) return val
	// port number
	if (port >= 0) return port
	return false
}

// Event listener for HTTP server 'error' event.
function onError(error: any) {
	if (error.syscall !== 'listen') throw error

	const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port
	// handle specific listen errors with friendly messages
	switch (error.code) {
		case 'EACCES':
			logger.error(`${bind} requires elevated privileges`)
			process.exit(1)
		case 'EADDRINUSE':
			logger.error(`${bind} is already in use`)
			process.exit(1)
		default:
			throw error
	}
}

/**
 * Event listener for HTTP server 'listening' event.
 */
function onListening() {
	logger.info(`✅Listening on ${port}`)
	debug('Listening on ' + port)
}

// Handle uncaught exceptions
process.on('uncaughtException', (uncaughtExc) => {
	// Won't execute
	logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down..')
	logger.error('uncaughtException Err::', uncaughtExc)
	logger.error('uncaughtException Stack::', JSON.stringify(uncaughtExc.stack))
	console.error(uncaughtExc)
	process.exit(1)
})

// Setup an express server and define port to listen all incoming requests for this application
;(async () => {
	const app = require('../app')
	const dbClient = require('../services/prisma')

	const db = dbClient.default

	try {
		logger.log('warn', '🤞Trying to connect MYSQL')
		await db.$connect()
		logger.info('✅Connection has been established with MYSQL.')
	} catch (error) {
		logger.error('💥Error while connecting MYSQL', error)
	}

	// Initialize Development Data
	require('../initialize/index')

	// Get port from environment and store in Express.
	app.set('port', port)
	// In case of an error
	app.on('error', (appErr: Error, appCtx: any) => {
		logger.error('app error', appErr.stack)
		logger.error('on url', appCtx.req.url)
		logger.error('with headers', appCtx.req.headers)
	})

	// Create HTTP server.
	const server = http.createServer(app)

	const closeAllExternalServices = async () => {
		// Try disconnecting Prisma
		try {
			logger.log('warn', '🤞Trying to disconnect MYSQL')
			await db.$disconnect()
			logger.info('✅Connection has been closed with MYSQL.')
		} catch (error) {
			logger.error('💥Error while disconnecting MYSQL', error)
		}
	}

	// Handle unhandled promise rejections
	process.on('unhandledRejection', async (unhandledRejection: Error) => {
		logger.log('warn', 'UNHANDLED REJECTION! 💥 Shutting down...')
		logger.error('unhandledRejection Err::', unhandledRejection)
		logger.error(
			'unhandledRejection Stack::',
			JSON.stringify(unhandledRejection.stack)
		)
		// Try disconnecting to all external services
		await closeAllExternalServices()
		// Close server & exit process
		server.close(() => process.exit(1))
	})

	process.on('SIGINT', async () => {
		logger.log('warn', '👋 SIGINT RECEIVED. Shutting down gracefully')
		// Try disconnecting to all external services
		await closeAllExternalServices()
		logger.log('warn', '💥 Process terminated!')
		server.close(() => process.exit(0))
	})

	// Listen on provided port, on all network interfaces.
	server.listen(port)
	server.on('error', onError)
	server.on('listening', onListening)
})()
