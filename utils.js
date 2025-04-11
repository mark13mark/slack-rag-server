// Track when your app started
const appStartTime = Date.now();

app.use(async ({ payload, next, logger }) => {
  // Skip events that were generated before the app started
  // This assumes event.ts is a Unix timestamp in seconds
  const eventTime = payload.event?.ts ? parseFloat(payload.event.ts) * 1000 : Date.now();

  if (eventTime < appStartTime) {
    logger.info(`Ignoring event from before app startup`);
    return;
  }

  await next();
});



async function purgeEvents() {
  try {
    // Store your current event subscriptions
    const eventConfig = await client.apps.event.authorizations.list();

    // Unsubscribe from events
    await client.apps.event.subscriptions.update({ subscribe: false });

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Resubscribe to events
    await client.apps.event.subscriptions.update({ subscribe: true });

    console.log('Successfully purged event queue');
  } catch (error) {
    console.error('Failed to purge events:', error);
  }
}


// Create a simple deduplication set
const processedEventIds = new Set();

// Add this middleware to your Bolt app
app.use(async ({ logger, payload, next }) => {
  // Get a unique ID for this event
  const eventId = payload.event_id ||
                 (payload.event ? `${payload.event.channel}-${payload.event.ts}` : null);

  if (eventId) {
    if (processedEventIds.has(eventId)) {
      logger.info(`Skipping duplicate event ${eventId}`);
      return;
    }

    // Add to processed set
    processedEventIds.add(eventId);

    // Clean up old event IDs (after 30 seconds)
    setTimeout(() => {
      processedEventIds.delete(eventId);
    }, 30000);
  }

  await next();
});
