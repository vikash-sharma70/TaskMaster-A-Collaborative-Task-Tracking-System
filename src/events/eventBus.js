'use strict';

const { EventEmitter } = require('node:events');
const logger = require('../config/logger');

/**
 * In-process domain event bus.
 *
 * Services publish facts ("task.updated") without knowing who reacts to them;
 * notification and real-time modules subscribe. This keeps the request path
 * fast (side effects run after the response is produced) and the modules
 * decoupled. In a multi-instance deployment this can be swapped for a broker
 * (Redis Streams, RabbitMQ, ...) behind the same publish/subscribe API.
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Publishes an event. Listeners run asynchronously and their failures are
   * logged, never propagated to the publisher.
   */
  publish(event, payload) {
    setImmediate(() => this.emit(event, payload));
  }

  /**
   * Subscribes an async-safe listener; rejections are caught and logged.
   * @returns {() => void} unsubscribe function
   */
  subscribe(event, handler) {
    const listener = async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error({ err, event }, 'Event handler failed');
      }
    };
    this.on(event, listener);
    return () => this.off(event, listener);
  }
}

module.exports = new EventBus();
