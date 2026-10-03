// MongoDB replica set initialization
// This runs on first container start only

print('=== Assistant MongoDB Init ===');
print('Replica set will be initialized via healthcheck.');
print('Database: assistant');

db = db.getSiblingDB('assistant');

// Create collections with validation (Mongoose handles schemas, 
// but this ensures collections exist for transactions)
db.createCollection('items');
db.createCollection('links');
db.createCollection('activities');
db.createCollection('decisions');
db.createCollection('blockers');
db.createCollection('endpoints');
db.createCollection('users');

print('=== Collections created ===');
