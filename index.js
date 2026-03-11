const express = require('express');
const crypto = require('crypto');
const app = express();
app.use(express.json());

// ==================== CONFIGURATION ====================
// This is your whitelist - add your premium users here
const whitelist = {
    // Format: "LICENSE_KEY" : {
    //   hwid: null,              // Will be set when first used
    //   fingerprint: null,        // For mobile devices
    //   bindingMethod: null,      // 'hwid' or 'fingerprint'
    //   maxDevices: 1,            // How many devices can use this key
    //   note: "description",       // Optional note for you
    //   expires: null,            // null = never expires, or "2024-12-31"
    //   createdAt: timestamp,      // When key was created
    //   createdBy: "staff",        // Who created it
    //   lastUsed: null,            // Last time key was used
    //   totalUses: 0,              // Total number of uses
    //   banned: false,             // Ban individual key
    //   devices: []                 // Array of bound devices (for maxDevices > 1)
    // }
    
    // Add your test key here
    "lucky": {
        hwid: null,
        fingerprint: null,
        bindingMethod: null,
        maxDevices: 1,
        note: "Test key for development",
        expires: null,
        createdAt: new Date().toISOString(),
        createdBy: "system",
        lastUsed: null,
        totalUses: 0,
        banned: false,
        devices: []
    },
    
    // Add more keys as needed
    "madmoney": {
        hwid: null,
        fingerprint: null,
        bindingMethod: null,
        maxDevices: 1,
        note: "John's personal key",
        expires: null,
        createdAt: new Date().toISOString(),
        createdBy: "system",
        lastUsed: null,
        totalUses: 0,
        banned: false,
        devices: []
    },
    
    "lessons": {
        hwid: null,
        fingerprint: null,
        bindingMethod: null,
        maxDevices: 2,
        note: "Sarah's key (laptop + phone)",
        expires: "2024-12-31",
        createdAt: new Date().toISOString(),
        createdBy: "system",
        lastUsed: null,
        totalUses: 0,
        banned: false,
        devices: []
    }
};

// Blacklisted HWIDs or fingerprints
const blacklist = {
    // "banned_hwid_here": {
    //   reason: "Reason for ban",
    //   bannedAt: timestamp,
    //   bannedBy: "staff"
    // }
};

// Track usage with more details
const usageLog = [];
const staffActions = [];

// Stats tracking
let stats = {
    totalValidations: 0,
    totalKeysCreated: Object.keys(whitelist).length,
    totalBans: 0,
    peakConcurrent: 0,
    lastHourValidations: 0,
    lastHourReset: new Date()
};
// ========================================================

// Simple hash function
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

// Generate a random license key with custom format
function generateLicenseKey(prefix = 'VIP', length = 4, sections = 4) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = prefix + '-';
    
    for (let s = 0; s < sections; s++) {
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        if (s < sections - 1) result += '-';
    }
    
    return result;
}

// Bulk generate multiple keys
function generateBulkKeys(count, prefix = 'VIP', length = 4, sections = 4, maxDevices = 1, expires = null, note = '') {
    const keys = [];
    for (let i = 0; i < count; i++) {
        const newKey = generateLicenseKey(prefix, length, sections);
        keys.push({
            key: newKey,
            details: {
                hwid: null,
                fingerprint: null,
                bindingMethod: null,
                maxDevices: maxDevices,
                note: note ? `${note} #${i+1}` : `Bulk key ${i+1}`,
                expires: expires,
                createdAt: new Date().toISOString(),
                createdBy: "staff",
                lastUsed: null,
                totalUses: 0,
                banned: false,
                devices: []
            }
        });
    }
    return keys;
}

// Main validation endpoint - Your Roblox script will call this
app.post('/validate', (req, res) => {
    try {
        const { 
            key,
            hwid,
            fingerprint,
            executor,
            platform,
            userId,
            username,
            ip
        } = req.body;
        
        // Update stats
        stats.totalValidations++;
        stats.lastHourValidations++;
        
        // Reset last hour counter if needed
        if (new Date() - stats.lastHourReset > 3600000) {
            stats.lastHourValidations = 1;
            stats.lastHourReset = new Date();
        }
        
        console.log(`\n🔍 Validation attempt:`);
        console.log(`   Key: ${key}`);
        console.log(`   User: ${username || 'unknown'} (ID: ${userId || 'unknown'})`);
        console.log(`   Platform: ${platform || 'unknown'}`);
        console.log(`   HWID Available: ${hwid ? '✅ YES' : '❌ NO'}`);
        console.log(`   Executor: ${executor || 'unknown'}`);
        console.log(`   IP: ${ip || 'unknown'}`);
        
        // Check if key is banned
        if (whitelist[key] && whitelist[key].banned) {
            usageLog.push({ key, hwid: hwid || fingerprint, status: 'KEY_BANNED', time: new Date(), ip });
            return res.json({ 
                success: false, 
                message: "This license key has been banned" 
            });
        }
        
        // Check blacklist first
        if (hwid && blacklist[hwid]) {
            usageLog.push({ key, hwid, status: 'BLACKLISTED_HWID', time: new Date(), ip });
            return res.json({ 
                success: false, 
                message: "This device has been blacklisted" 
            });
        }
        
        if (fingerprint && blacklist[fingerprint]) {
            usageLog.push({ key, fingerprint, status: 'BLACKLISTED_FINGERPRINT', time: new Date(), ip });
            return res.json({ 
                success: false, 
                message: "This device has been blacklisted" 
            });
        }
        
        // Check if key exists
        if (!whitelist[key]) {
            usageLog.push({ key, hwid: hwid || fingerprint, status: 'INVALID_KEY', time: new Date(), ip });
            return res.json({ 
                success: false, 
                message: "Invalid license key" 
            });
        }
        
        const license = whitelist[key];
        
        // Check if expired
        if (license.expires && new Date(license.expires) < new Date()) {
            usageLog.push({ key, hwid: hwid || fingerprint, status: 'EXPIRED', time: new Date(), ip });
            return res.json({ 
                success: false, 
                message: "This license key has expired" 
            });
        }
        
        // Update license stats
        license.lastUsed = new Date().toISOString();
        license.totalUses++;
        
        // CASE 1: Key not bound to anything yet (first time use)
        if (license.bindingMethod === null) {
            // Decide which binding method to use
            if (hwid) {
                // PC with HWID - bind using HWID
                if (license.maxDevices > 1) {
                    // Multi-device key - add to devices array
                    if (!license.devices) license.devices = [];
                    if (license.devices.length < license.maxDevices) {
                        license.devices.push({
                            hwid: hwid,
                            firstSeen: new Date().toISOString(),
                            lastSeen: new Date().toISOString(),
                            platform: platform,
                            executor: executor,
                            userId: userId,
                            username: username
                        });
                        
                        if (license.devices.length === 1) {
                            license.bindingMethod = 'hwid';
                        }
                    } else {
                        return res.json({ 
                            success: false, 
                            message: "This key has reached its maximum device limit" 
                        });
                    }
                } else {
                    // Single device key
                    license.hwid = hwid;
                    license.bindingMethod = 'hwid';
                }
                
                usageLog.push({ key, hwid, status: 'BOUND_HWID', time: new Date(), ip });
                
                return res.json({ 
                    success: true, 
                    message: license.maxDevices > 1 ? 
                        `License activated (${license.devices.length}/${license.maxDevices} devices)` : 
                        "License activated and bound to this PC (HWID)",
                    bindingMethod: 'hwid',
                    devicesLeft: license.maxDevices > 1 ? license.maxDevices - license.devices.length : 0
                });
            } 
            else if (fingerprint) {
                // Mobile or no HWID - bind using fingerprint
                if (license.maxDevices > 1) {
                    // Multi-device key
                    if (!license.devices) license.devices = [];
                    if (license.devices.length < license.maxDevices) {
                        license.devices.push({
                            fingerprint: fingerprint,
                            firstSeen: new Date().toISOString(),
                            lastSeen: new Date().toISOString(),
                            platform: platform,
                            executor: executor,
                            userId: userId,
                            username: username
                        });
                        
                        if (license.devices.length === 1) {
                            license.bindingMethod = 'fingerprint';
                        }
                    } else {
                        return res.json({ 
                            success: false, 
                            message: "This key has reached its maximum device limit" 
                        });
                    }
                } else {
                    license.fingerprint = fingerprint;
                    license.bindingMethod = 'fingerprint';
                }
                
                usageLog.push({ key, fingerprint, status: 'BOUND_FINGERPRINT', time: new Date(), ip });
                
                return res.json({ 
                    success: true, 
                    message: license.maxDevices > 1 ? 
                        `License activated (${license.devices.length}/${license.maxDevices} devices)` : 
                        "License activated and bound to this device",
                    bindingMethod: 'fingerprint',
                    devicesLeft: license.maxDevices > 1 ? license.maxDevices - license.devices.length : 0
                });
            }
            else {
                return res.json({ 
                    success: false, 
                    message: "Cannot identify your device" 
                });
            }
        }
        
        // CASE 2: Key bound with HWID (PC user)
        if (license.bindingMethod === 'hwid') {
            if (license.maxDevices > 1) {
                // Multi-device check
                if (license.devices && license.devices.some(d => d.hwid === hwid)) {
                    // Update last seen
                    const device = license.devices.find(d => d.hwid === hwid);
                    if (device) {
                        device.lastSeen = new Date().toISOString();
                        device.lastUser = username;
                        device.lastUserId = userId;
                    }
                    
                    usageLog.push({ key, hwid, status: 'VALID_HWID', time: new Date(), ip });
                    return res.json({ 
                        success: true, 
                        message: `Access granted (Device ${license.devices.findIndex(d => d.hwid === hwid) + 1}/${license.maxDevices})`,
                        bindingMethod: 'hwid'
                    });
                } else {
                    usageLog.push({ key, hwid, expected: license.hwid, status: 'HWID_MISMATCH', time: new Date(), ip });
                    return res.json({ 
                        success: false, 
                        message: "This device is not authorized for this key" 
                    });
                }
            } else {
                if (hwid === license.hwid) {
                    usageLog.push({ key, hwid, status: 'VALID_HWID', time: new Date(), ip });
                    return res.json({ 
                        success: true, 
                        message: "Access granted (HWID verified)",
                        bindingMethod: 'hwid'
                    });
                } else {
                    usageLog.push({ key, hwid, expected: license.hwid, status: 'HWID_MISMATCH', time: new Date(), ip });
                    return res.json({ 
                        success: false, 
                        message: "This license is bound to a different PC" 
                    });
                }
            }
        }
        
        // CASE 3: Key bound with fingerprint (mobile user)
        if (license.bindingMethod === 'fingerprint') {
            if (license.maxDevices > 1) {
                // Multi-device check
                if (license.devices && license.devices.some(d => d.fingerprint === fingerprint)) {
                    // Update last seen
                    const device = license.devices.find(d => d.fingerprint === fingerprint);
                    if (device) {
                        device.lastSeen = new Date().toISOString();
                        device.lastUser = username;
                        device.lastUserId = userId;
                    }
                    
                    usageLog.push({ key, fingerprint, status: 'VALID_FINGERPRINT', time: new Date(), ip });
                    return res.json({ 
                        success: true, 
                        message: `Access granted (Device ${license.devices.findIndex(d => d.fingerprint === fingerprint) + 1}/${license.maxDevices})`,
                        bindingMethod: 'fingerprint'
                    });
                } else {
                    usageLog.push({ key, fingerprint, expected: license.fingerprint, status: 'FINGERPRINT_MISMATCH', time: new Date(), ip });
                    return res.json({ 
                        success: false, 
                        message: "This device is not authorized for this key" 
                    });
                }
            } else {
                if (fingerprint === license.fingerprint) {
                    usageLog.push({ key, fingerprint, status: 'VALID_FINGERPRINT', time: new Date(), ip });
                    return res.json({ 
                        success: true, 
                        message: "Access granted",
                        bindingMethod: 'fingerprint'
                    });
                } else {
                    usageLog.push({ key, fingerprint, expected: license.fingerprint, status: 'FINGERPRINT_MISMATCH', time: new Date(), ip });
                    return res.json({ 
                        success: false, 
                        message: "This license is bound to a different device" 
                    });
                }
            }
        }
        
    } catch (error) {
        console.error("Server error:", error);
        res.json({ 
            success: false, 
            message: "Server error" 
        });
    }
});

// Simple home page - shows minimal info for public
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>API Server</title>
            <style>
                body { 
                    font-family: Arial; 
                    background: #1a1a1a; 
                    color: white; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    height: 100vh; 
                    margin: 0;
                }
                .card {
                    background: #2d2d2d;
                    padding: 40px;
                    border-radius: 10px;
                    text-align: center;
                    box-shadow: 0 0 20px rgba(102, 126, 234, 0.3);
                }
                h2 { 
                    color: #667eea; 
                    margin-bottom: 10px;
                }
                .status { color: #4CAF50; }
                p { color: #888; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>✅ Server is Running</h2>
                <p class="status">Authentication API active</p>
                <p style="font-size: 12px; margin-top: 20px;">${Object.keys(whitelist).length} licenses configured</p>
                <p style="font-size: 12px;">${stats.totalValidations} total validations</p>
            </div>
        </body>
        </html>
    `);
});

// API endpoint to create new keys (for staff)
app.post('/create-key', (req, res) => {
    const { adminKey, prefix, length, sections, maxDevices, expires, note, createdBy } = req.body;
    
    // Check admin password
    if (adminKey !== "madmoney072") {
        return res.json({ success: false, message: "Unauthorized" });
    }
    
    // Generate new key
    const newKey = generateLicenseKey(prefix || 'VIP', length || 4, sections || 4);
    
    // Calculate expiration
    let expirationDate = null;
    if (expires) {
        if (expires === 'never') {
            expirationDate = null;
        } else if (expires.includes('-')) {
            // Specific date
            expirationDate = expires;
        } else {
            // Days from now
            const date = new Date();
            date.setDate(date.getDate() + parseInt(expires));
            expirationDate = date.toISOString().split('T')[0];
        }
    }
    
    // Add to whitelist
    whitelist[newKey] = {
        hwid: null,
        fingerprint: null,
        bindingMethod: null,
        maxDevices: maxDevices || 1,
        note: note || "New license key",
        expires: expirationDate,
        createdAt: new Date().toISOString(),
        createdBy: createdBy || "staff",
        lastUsed: null,
        totalUses: 0,
        banned: false,
        devices: maxDevices > 1 ? [] : null
    };
    
    // Update stats
    stats.totalKeysCreated++;
    
    // Log the creation
    staffActions.push({
        action: 'KEY_CREATED',
        key: newKey,
        details: { maxDevices, expires, note },
        performedBy: createdBy || "staff",
        time: new Date().toISOString()
    });
    
    usageLog.push({ 
        key: newKey, 
        status: 'KEY_CREATED', 
        time: new Date(),
        note: note 
    });
    
    res.json({ 
        success: true, 
        message: "Key created successfully",
        key: newKey,
        details: whitelist[newKey]
    });
});

// Bulk create keys
app.post('/bulk-create-keys', (req, res) => {
    const { adminKey, count, prefix, length, sections, maxDevices, expires, note, createdBy } = req.body;
    
    if (adminKey !== "madmoney072") {
        return res.json({ success: false, message: "Unauthorized" });
    }
    
    if (count > 100) {
        return res.json({ success: false, message: "Maximum 100 keys per bulk creation" });
    }
    
    // Calculate expiration
    let expirationDate = null;
    if (expires && expires !== 'never') {
        const date = new Date();
        date.setDate(date.getDate() + parseInt(expires));
        expirationDate = date.toISOString().split('T')[0];
    }
    
    const keys = generateBulkKeys(count, prefix || 'VIP', length || 4, sections || 4, maxDevices || 1, expirationDate, note || '');
    
    keys.forEach(k => {
        whitelist[k.key] = {
            ...k.details,
            devices: maxDevices > 1 ? [] : null
        };
    });
    
    stats.totalKeysCreated += count;
    
    staffActions.push({
        action: 'BULK_KEYS_CREATED',
        count: count,
        details: { prefix, maxDevices, expires, note },
        performedBy: createdBy || "staff",
        time: new Date().toISOString()
    });
    
    res.json({ 
        success: true, 
        message: `${count} keys created successfully`,
        keys: keys.map(k => k.key)
    });
});

// Ban/unban key
app.post('/toggle-ban', (req, res) => {
    const { adminKey, licenseKey, ban, reason } = req.body;
    
    if (adminKey !== "madmoney072") {
        return res.json({ success: false, message: "Unauthorized" });
    }
    
    if (!whitelist[licenseKey]) {
        return res.json({ success: false, message: "Key not found" });
    }
    
    whitelist[licenseKey].banned = ban;
    if (ban) {
        whitelist[licenseKey].banReason = reason || "No reason provided";
        whitelist[licenseKey].bannedAt = new Date().toISOString();
        stats.totalBans++;
    } else {
        whitelist[licenseKey].banReason = null;
        whitelist[licenseKey].bannedAt = null;
    }
    
    staffActions.push({
        action: ban ? 'KEY_BANNED' : 'KEY_UNBANNED',
        key: licenseKey,
        reason: reason,
        performedBy: "staff",
        time: new Date().toISOString()
    });
    
    res.json({ 
        success: true, 
        message: ban ? "Key banned successfully" : "Key unbanned successfully"
    });
});

// Delete key
app.post('/delete-key', (req, res) => {
    const { adminKey, licenseKey } = req.body;
    
    if (adminKey !== "madmoney072") {
        return res.json({ success: false, message: "Unauthorized" });
    }
    
    if (!whitelist[licenseKey]) {
        return res.json({ success: false, message: "Key not found" });
    }
    
    delete whitelist[licenseKey];
    
    staffActions.push({
        action: 'KEY_DELETED',
        key: licenseKey,
        performedBy: "staff",
        time: new Date().toISOString()
    });
    
    res.json({ success: true, message: "Key deleted successfully" });
});

// Reset endpoint (for when users get new devices)
app.post('/reset', (req, res) => {
    const { adminKey, licenseKey } = req.body;
    
    if (adminKey !== "madmoney072") {
        return res.json({ success: false, message: "Unauthorized" });
    }
    
    if (whitelist[licenseKey]) {
        const license = whitelist[licenseKey];
        license.hwid = null;
        license.fingerprint = null;
        license.bindingMethod = null;
        license.devices = license.maxDevices > 1 ? [] : null;
        license.lastUsed = null;
        
        staffActions.push({
            action: 'KEY_RESET',
            key: licenseKey,
            performedBy: "staff",
            time: new Date().toISOString()
        });
        
        res.json({ success: true, message: "License reset successfully" });
    } else {
        res.json({ success: false, message: "License not found" });
    }
});

// Get server stats
app.get('/stats', (req, res) => {
    const { adminKey } = req.query;
    
    if (adminKey !== "madmoney072") {
        return res.json({ success: false, message: "Unauthorized" });
    }
    
    const boundKeys = Object.values(whitelist).filter(l => l.bindingMethod !== null).length;
    const bannedKeys = Object.values(whitelist).filter(l => l.banned).length;
    const expiredKeys = Object.values(whitelist).filter(l => l.expires && new Date(l.expires) < new Date()).length;
    const multiDeviceKeys = Object.values(whitelist).filter(l => l.maxDevices > 1).length;
    
    res.json({
        success: true,
        stats: {
            totalKeys: Object.keys(whitelist).length,
            boundKeys: boundKeys,
            availableKeys: Object.keys(whitelist).length - boundKeys,
            bannedKeys: bannedKeys,
            expiredKeys: expiredKeys,
            multiDeviceKeys: multiDeviceKeys,
            totalValidations: stats.totalValidations,
            lastHourValidations: stats.lastHourValidations,
            totalBans: stats.totalBans,
            totalStaffActions: staffActions.length
        }
    });
});

// STAFF ONLY - Ultimate Admin Panel with ALL Features
app.get('/admin', (req, res) => {
    const password = req.query.password;
    
    // Check password
    if (password !== "madmoney072") {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Access Denied</title>
                <style>
                    body {
                        font-family: 'Inter', sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0;
                    }
                    .error-card {
                        background: white;
                        padding: 40px;
                        border-radius: 20px;
                        text-align: center;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        max-width: 400px;
                    }
                    h1 { color: #ef4444; margin-bottom: 20px; font-size: 28px; }
                    p { color: #666; margin-bottom: 20px; }
                    .lock-icon { font-size: 48px; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <div class="error-card">
                    <div class="lock-icon">🔒</div>
                    <h1>Access Denied</h1>
                    <p>Invalid admin password. This area is for staff only.</p>
                </div>
            </body>
            </html>
        `);
    }
    
    // Calculate stats
    const totalBound = Object.values(whitelist).filter(l => l.bindingMethod !== null).length;
    const totalPC = Object.values(whitelist).filter(l => l.bindingMethod === 'hwid').length;
    const totalMobile = Object.values(whitelist).filter(l => l.bindingMethod === 'fingerprint').length;
    const expiredKeys = Object.values(whitelist).filter(l => l.expires && new Date(l.expires) < new Date()).length;
    const bannedKeys = Object.values(whitelist).filter(l => l.banned).length;
    const multiDeviceKeys = Object.values(whitelist).filter(l => l.maxDevices > 1).length;
    const totalDevices = Object.values(whitelist).reduce((acc, l) => {
        if (l.devices) return acc + l.devices.length;
        if (l.hwid || l.fingerprint) return acc + 1;
        return acc;
    }, 0);
    
    // Generate admin panel HTML
    let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ultimate HWID License System - Staff Panel</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                    background: #0f0f0f;
                    color: #fff;
                    padding: 20px;
                }
                
                .container {
                    max-width: 1800px;
                    margin: 0 auto;
                }
                
                /* Header */
                .header {
                    background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
                    padding: 25px 30px;
                    border-radius: 15px;
                    margin-bottom: 25px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border: 1px solid #333;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                }
                
                .header h1 {
                    font-size: 28px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                
                .badge {
                    background: #2d2d2d;
                    padding: 8px 16px;
                    border-radius: 30px;
                    font-size: 14px;
                    color: #888;
                    border: 1px solid #444;
                }
                
                .badge i {
                    color: #4CAF50;
                    margin-right: 5px;
                }
                
                /* Stats Grid */
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin-bottom: 25px;
                }
                
                .stat-card {
                    background: #1a1a1a;
                    border-radius: 12px;
                    padding: 20px;
                    border: 1px solid #333;
                    transition: transform 0.2s, border-color 0.2s;
                }
                
                .stat-card:hover {
                    transform: translateY(-2px);
                    border-color: #667eea;
                }
                
                .stat-title {
                    color: #888;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 8px;
                }
                
                .stat-number {
                    font-size: 32px;
                    font-weight: 700;
                    color: #fff;
                    margin-bottom: 5px;
                }
                
                .stat-sub {
                    color: #4CAF50;
                    font-size: 12px;
                }
                
                /* Tab Navigation */
                .tabs {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }
                
                .tab {
                    background: #1a1a1a;
                    padding: 12px 25px;
                    border-radius: 30px;
                    cursor: pointer;
                    border: 1px solid #333;
                    transition: all 0.2s;
                    font-weight: 600;
                }
                
                .tab:hover {
                    border-color: #667eea;
                }
                
                .tab.active {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-color: transparent;
                }
                
                .tab-content {
                    display: none;
                }
                
                .tab-content.active {
                    display: block;
                }
                
                /* Generator Section */
                .generator-container {
                    background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
                    border-radius: 15px;
                    padding: 30px;
                    border: 1px solid #667eea;
                    margin-bottom: 30px;
                }
                
                .generator-title {
                    font-size: 22px;
                    margin-bottom: 25px;
                    color: #fff;
                }
                
                .generator-title i {
                    color: #667eea;
                    margin-right: 10px;
                }
                
                .generator-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin-bottom: 20px;
                }
                
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                
                .form-group label {
                    color: #888;
                    font-size: 13px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .form-group input, .form-group select, .form-group textarea {
                    background: #1a1a1a;
                    border: 1px solid #444;
                    padding: 12px 15px;
                    border-radius: 8px;
                    color: white;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                
                .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
                    outline: none;
                    border-color: #667eea;
                }
                
                .form-group input::placeholder {
                    color: #666;
                }
                
                .generate-btn {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 15px 30px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                    width: 100%;
                    margin-top: 10px;
                }
                
                .generate-btn:hover {
                    transform: translateY(-2px);
                }
                
                .key-result {
                    margin-top: 25px;
                    padding: 20px;
                    background: #1a1a1a;
                    border-radius: 10px;
                    display: none;
                    border: 1px solid #4CAF50;
                }
                
                .key-result.show {
                    display: block;
                    animation: slideIn 0.3s ease;
                }
                
                .key-display {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #0f0f0f;
                    padding: 15px 20px;
                    border-radius: 8px;
                    margin-top: 10px;
                }
                
                .key-text {
                    font-family: 'Monaco', monospace;
                    font-size: 24px;
                    font-weight: bold;
                    color: #4CAF50;
                    letter-spacing: 2px;
                }
                
                .copy-key-btn {
                    background: #2d2d2d;
                    color: white;
                    border: 1px solid #444;
                    padding: 8px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .copy-key-btn:hover {
                    background: #3d3d3d;
                    border-color: #667eea;
                }
                
                /* Tables */
                .table-container {
                    background: #1a1a1a;
                    border-radius: 15px;
                    padding: 25px;
                    border: 1px solid #333;
                    margin-bottom: 25px;
                }
                
                .table-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                    gap: 15px;
                }
                
                .table-header h2 {
                    font-size: 20px;
                    color: #fff;
                }
                
                .table-header h2 i {
                    margin-right: 10px;
                    color: #667eea;
                }
                
                .table-controls {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }
                
                .search-box {
                    background: #2d2d2d;
                    border: 1px solid #444;
                    padding: 8px 15px;
                    border-radius: 8px;
                    color: white;
                    min-width: 250px;
                }
                
                .filter-select {
                    background: #2d2d2d;
                    border: 1px solid #444;
                    padding: 8px 15px;
                    border-radius: 8px;
                    color: white;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                
                th {
                    text-align: left;
                    padding: 15px 10px;
                    color: #888;
                    font-weight: 600;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 2px solid #333;
                }
                
                td {
                    padding: 15px 10px;
                    border-bottom: 1px solid #2d2d2d;
                    font-size: 13px;
                }
                
                tr:hover td {
                    background: #252525;
                }
                
                /* Badges */
                .status-badge {
                    padding: 4px 12px;
                    border-radius: 30px;
                    font-size: 11px;
                    font-weight: 600;
                    display: inline-block;
                }
                
                .status-bound {
                    background: rgba(16, 185, 129, 0.2);
                    color: #10b981;
                    border: 1px solid #10b981;
                }
                
                .status-available {
                    background: rgba(245, 158, 11, 0.2);
                    color: #f59e0b;
                    border: 1px solid #f59e0b;
                }
                
                .status-expired {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                    border: 1px solid #ef4444;
                }
                
                .status-banned {
                    background: rgba(139, 0, 0, 0.2);
                    color: #ff6b6b;
                    border: 1px solid #ff6b6b;
                }
                
                .method-hwid {
                    background: rgba(102, 126, 234, 0.2);
                    color: #667eea;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 10px;
                    font-weight: 600;
                }
                
                .method-fp {
                    background: rgba(245, 158, 11, 0.2);
                    color: #f59e0b;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 10px;
                    font-weight: 600;
                }
                
                .device-id {
                    font-family: 'Monaco', 'Menlo', monospace;
                    font-size: 11px;
                    color: #888;
                    max-width: 150px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                /* Action Buttons */
                .action-btn {
                    background: #2d2d2d;
                    border: 1px solid #444;
                    color: white;
                    padding: 5px 10px;
                    border-radius: 5px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin: 0 2px;
                }
                
                .action-btn:hover {
                    background: #3d3d3d;
                    border-color: #667eea;
                }
                
                .action-btn.danger:hover {
                    background: #ef4444;
                    border-color: #ef4444;
                }
                
                .action-btn.success:hover {
                    background: #10b981;
                    border-color: #10b981;
                }
                
                /* Logs */
                .log-container {
                    background: #1a1a1a;
                    border-radius: 15px;
                    padding: 25px;
                    border: 1px solid #333;
                    max-height: 500px;
                    overflow-y: auto;
                }
                
                .log-entry {
                    display: grid;
                    grid-template-columns: 180px 120px 1fr 100px;
                    gap: 15px;
                    padding: 10px;
                    border-bottom: 1px solid #2d2d2d;
                    font-size: 12px;
                }
                
                .log-time {
                    color: #888;
                }
                
                .log-key {
                    font-weight: 600;
                    color: #667eea;
                }
                
                .log-status {
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 11px;
                    text-align: center;
                }
                
                .status-success {
                    background: rgba(16, 185, 129, 0.2);
                    color: #10b981;
                }
                
                .status-failed {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                }
                
                .status-warning {
                    background: rgba(245, 158, 11, 0.2);
                    color: #f59e0b;
                }
                
                /* Footer */
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    color: #666;
                    font-size: 12px;
                }
                
                /* Modal */
                .modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.8);
                    z-index: 1000;
                    align-items: center;
                    justify-content: center;
                }
                
                .modal.show {
                    display: flex;
                }
                
                .modal-content {
                    background: #1a1a1a;
                    border-radius: 15px;
                    padding: 30px;
                    max-width: 500px;
                    width: 90%;
                    border: 1px solid #667eea;
                }
                
                .modal-content h3 {
                    margin-bottom: 20px;
                    color: #667eea;
                }
                
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <!-- Header -->
                <div class="header">
                    <div>
                        <h1>🔐 ULTIMATE HWID LICENSE SYSTEM - STAFF PANEL</h1>
                        <div style="margin-top: 8px; color: #888; font-size: 14px;">
                            <i>Complete license management with multi-device support</i>
                        </div>
                    </div>
                    <div class="badge">
                        <i>●</i> Last Updated: ${new Date().toLocaleString()}
                    </div>
                </div>
                
                <!-- Stats Overview -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-title">Total Licenses</div>
                        <div class="stat-number">${Object.keys(whitelist).length}</div>
                        <div class="stat-sub">${totalBound} bound</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-title">Total Devices</div>
                        <div class="stat-number">${totalDevices}</div>
                        <div class="stat-sub">${totalPC} PC / ${totalMobile} Mobile</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-title">Multi-Device Keys</div>
                        <div class="stat-number">${multiDeviceKeys}</div>
                        <div class="stat-sub">Up to ${Math.max(...Object.values(whitelist).map(l => l.maxDevices))} devices</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-title">Banned Keys</div>
                        <div class="stat-number">${bannedKeys}</div>
                        <div class="stat-sub">${stats.totalBans} total bans</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-title">Expired Keys</div>
                        <div class="stat-number">${expiredKeys}</div>
                        <div class="stat-sub">${((expiredKeys/Object.keys(whitelist).length)*100 || 0).toFixed(1)}%</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-title">Validations</div>
                        <div class="stat-number">${stats.totalValidations}</div>
                        <div class="stat-sub">${stats.lastHourValidations} last hour</div>
                    </div>
                </div>
                
                <!-- Tabs -->
                <div class="tabs">
                    <div class="tab active" onclick="switchTab('generator')">✨ Key Generator</div>
                    <div class="tab" onclick="switchTab('keys')">🔑 License Keys</div>
                    <div class="tab" onclick="switchTab('devices')">📱 Devices</div>
                    <div class="tab" onclick="switchTab('logs')">📊 Activity Logs</div>
                    <div class="tab" onclick="switchTab('staff')">👥 Staff Actions</div>
                    <div class="tab" onclick="switchTab('stats')">📈 Advanced Stats</div>
                </div>
                
                <!-- Tab 1: Key Generator -->
                <div id="generator" class="tab-content active">
                    <!-- Single Key Generator -->
                    <div class="generator-container">
                        <div class="generator-title">
                            <i>🔑</i> Generate Single License Key
                        </div>
                        
                        <div class="generator-grid">
                            <div class="form-group">
                                <label>Key Prefix</label>
                                <input type="text" id="keyPrefix" placeholder="VIP" value="VIP">
                            </div>
                            
                            <div class="form-group">
                                <label>Key Format</label>
                                <select id="keyFormat">
                                    <option value="4-4">XXXX-XXXX-XXXX (Default)</option>
                                    <option value="4-3">XXXX-XXXX-XXXX (3 sections)</option>
                                    <option value="5-4">XXXXX-XXXXX-XXXXX-XXXXX (5 chars)</option>
                                    <option value="3-6">XXX-XXX-XXX-XXX-XXX-XXX (3 chars)</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Max Devices</label>
                                <select id="maxDevices">
                                    <option value="1">1 Device</option>
                                    <option value="2">2 Devices</option>
                                    <option value="3">3 Devices</option>
                                    <option value="5">5 Devices</option>
                                    <option value="10">10 Devices</option>
                                    <option value="25">25 Devices</option>
                                    <option value="50">50 Devices</option>
                                    <option value="100">100 Devices</option>
                                    <option value="999">Unlimited (999)</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Expiration</label>
                                <select id="expires">
                                    <option value="never">Never Expires</option>
                                    <option value="7">7 Days</option>
                                    <option value="30">30 Days</option>
                                    <option value="60">60 Days</option>
                                    <option value="90">90 Days</option>
                                    <option value="180">6 Months</option>
                                    <option value="365">1 Year</option>
                                    <option value="730">2 Years</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Note / Owner</label>
                                <input type="text" id="keyNote" placeholder="e.g., John Smith - VIP">
                            </div>
                            
                            <div class="form-group">
                                <label>Created By</label>
                                <input type="text" id="createdBy" placeholder="Staff name" value="staff">
                            </div>
                        </div>
                        
                        <button class="generate-btn" onclick="generateKey()">✨ Generate License Key</button>
                        
                        <div id="keyResult" class="key-result">
                            <div style="color: #888; margin-bottom: 5px;">🎉 New Key Generated:</div>
                            <div class="key-display">
                                <span id="generatedKey" class="key-text">XXXX-XXXX-XXXX</span>
                                <button class="copy-key-btn" onclick="copyGeneratedKey()">Copy Key</button>
                            </div>
                            <div style="margin-top: 10px; color: #888; font-size: 12px;">
                                Max Devices: <span id="resultDevices">1</span> | 
                                Expires: <span id="resultExpires">Never</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Bulk Key Generator -->
                    <div class="generator-container" style="border-color: #f59e0b;">
                        <div class="generator-title">
                            <i>📦</i> Bulk Generate Keys (Up to 100 at once)
                        </div>
                        
                        <div class="generator-grid">
                            <div class="form-group">
                                <label>Number of Keys</label>
                                <input type="number" id="bulkCount" min="1" max="100" value="10">
                            </div>
                            
                            <div class="form-group">
                                <label>Key Prefix</label>
                                <input type="text" id="bulkPrefix" placeholder="VIP" value="VIP">
                            </div>
                            
                            <div class="form-group">
                                <label>Max Devices (per key)</label>
                                <select id="bulkMaxDevices">
                                    <option value="1">1 Device</option>
                                    <option value="2">2 Devices</option>
                                    <option value="3">3 Devices</option>
                                    <option value="5">5 Devices</option>
                                    <option value="10">10 Devices</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Expiration</label>
                                <select id="bulkExpires">
                                    <option value="never">Never Expires</option>
                                    <option value="30">30 Days</option>
                                    <option value="90">90 Days</option>
                                    <option value="365">1 Year</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Batch Note</label>
                                <input type="text" id="bulkNote" placeholder="e.g., Giveaway keys">
                            </div>
                        </div>
                        
                        <button class="generate-btn" onclick="bulkGenerateKeys()" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">📦 Generate Bulk Keys</button>
                        
                        <div id="bulkKeyResult" class="key-result">
                            <div style="color: #888; margin-bottom: 5px;">📋 Generated Keys:</div>
                            <div style="max-height: 200px; overflow-y: auto; background: #0f0f0f; padding: 10px; border-radius: 5px;">
                                <div id="bulkKeyList" style="font-family: monospace; font-size: 12px;"></div>
                            </div>
                            <button class="copy-key-btn" onclick="copyAllBulkKeys()" style="margin-top: 10px;">Copy All Keys</button>
                        </div>
                    </div>
                </div>
                
                <!-- Tab 2: License Keys Table -->
                <div id="keys" class="tab-content">
                    <div class="table-container">
                        <div class="table-header">
                            <h2><i>🔑</i> License Keys Management</h2>
                            <div class="table-controls">
                                <input type="text" class="search-box" id="keySearch" placeholder="🔍 Search keys..." onkeyup="filterKeys()">
                                <select class="filter-select" id="statusFilter" onchange="filterKeys()">
                                    <option value="all">All Keys</option>
                                    <option value="available">Available</option>
                                    <option value="bound">Bound</option>
                                    <option value="expired">Expired</option>
                                    <option value="banned">Banned</option>
                                </select>
                            </div>
                        </div>
                        
                        <div style="overflow-x: auto;">
                            <table id="keysTable">
                                <thead>
                                    <tr>
                                        <th>License Key</th>
                                        <th>Status</th>
                                        <th>Method</th>
                                        <th>Devices</th>
                                        <th>Device ID</th>
                                        <th>Note</th>
                                        <th>Last Used</th>
                                        <th>Uses</th>
                                        <th>Expires</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
    `;
    
    // Add each license to table
    for (const [key, data] of Object.entries(whitelist)) {
        // Determine status
        let statusClass = 'status-available';
        let statusText = 'Available';
        
        if (data.banned) {
            statusClass = 'status-banned';
            statusText = 'Banned';
        } else if (data.expires && new Date(data.expires) < new Date()) {
            statusClass = 'status-expired';
            statusText = 'Expired';
        } else if (data.bindingMethod) {
            statusClass = 'status-bound';
            statusText = 'Bound';
        }
        
        // Determine method badge
        let methodBadge = '';
        if (data.bindingMethod === 'hwid') {
            methodBadge = '<span class="method-hwid">HWID</span>';
        } else if (data.bindingMethod === 'fingerprint') {
            methodBadge = '<span class="method-fp">FP</span>';
        } else {
            methodBadge = '<span style="color: #666;">—</span>';
        }
        
        // Device count
        let deviceCount = '0/0';
        if (data.maxDevices > 1) {
            deviceCount = `${data.devices ? data.devices.length : 0}/${data.maxDevices}`;
        } else if (data.hwid || data.fingerprint) {
            deviceCount = '1/1';
        } else {
            deviceCount = `0/${data.maxDevices}`;
        }
        
        // Device ID display
        let deviceDisplay = '—';
        if (data.bindingMethod === 'hwid' && data.hwid) {
            deviceDisplay = `<span class="device-id" title="${data.hwid}">${data.hwid.substring(0, 16)}...</span>`;
        } else if (data.bindingMethod === 'fingerprint' && data.fingerprint) {
            deviceDisplay = `<span class="device-id" title="${data.fingerprint}">${data.fingerprint.substring(0, 16)}...</span>`;
        } else if (data.devices && data.devices.length > 0) {
            deviceDisplay = `<span class="device-id">${data.devices.length} devices</span>`;
        }
        
        // Last used
        const lastUsed = data.lastUsed ? new Date(data.lastUsed).toLocaleDateString() : 'Never';
        
        // Expiry display
        let expiryDisplay = data.expires || 'Never';
        if (data.expires && new Date(data.expires) < new Date()) {
            expiryDisplay = `<span style="color: #ef4444;">${data.expires}</span>`;
        }
        
        html += `
            <tr>
                <td><strong style="color: #fff; font-family: monospace;">${key}</strong></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${methodBadge}</td>
                <td>${deviceCount}</td>
                <td>${deviceDisplay}</td>
                <td style="color: #888; max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${data.note || '—'}</td>
                <td>${lastUsed}</td>
                <td>${data.totalUses || 0}</td>
                <td>${expiryDisplay}</td>
                <td>
                    <button class="action-btn" onclick="viewKeyDetails('${key}')" title="View Details">👁️</button>
                    <button class="action-btn" onclick="resetKey('${key}')" title="Reset Key">🔄</button>
                    ${!data.banned ? 
                        `<button class="action-btn danger" onclick="banKey('${key}')" title="Ban Key">🚫</button>` : 
                        `<button class="action-btn success" onclick="unbanKey('${key}')" title="Unban Key">✅</button>`
                    }
                    <button class="action-btn danger" onclick="deleteKey('${key}')" title="Delete Key">🗑️</button>
                </td>
            </tr>
        `;
    }
    
    html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <!-- Tab 3: Devices View -->
                <div id="devices" class="tab-content">
                    <div class="table-container">
                        <div class="table-header">
                            <h2><i>📱</i> All Bound Devices</h2>
                        </div>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>License Key</th>
                                    <th>Device Type</th>
                                    <th>Device ID</th>
                                    <th>Platform</th>
                                    <th>First Seen</th>
                                    <th>Last Seen</th>
                                    <th>Last User</th>
                                </tr>
                            </thead>
                            <tbody>
    `;
    
    // List all devices
    let hasDevices = false;
    for (const [key, data] of Object.entries(whitelist)) {
        if (data.devices && data.devices.length > 0) {
            hasDevices = true;
            data.devices.forEach((device, index) => {
                const deviceId = device.hwid || device.fingerprint || 'Unknown';
                html += `
                    <tr>
                        <td><strong style="color: #667eea;">${key}</strong></td>
                        <td>${device.hwid ? '🖥️ PC' : '📱 Mobile'}</td>
                        <td><span class="device-id" title="${deviceId}">${deviceId.substring(0, 20)}...</span></td>
                        <td>${device.platform || 'Unknown'}</td>
                        <td>${new Date(device.firstSeen).toLocaleString()}</td>
                        <td>${new Date(device.lastSeen).toLocaleString()}</td>
                        <td>${device.username || 'Unknown'} (${device.userId || '?'})</td>
                    </tr>
                `;
            });
        } else if (data.hwid || data.fingerprint) {
            hasDevices = true;
            const deviceId = data.hwid || data.fingerprint;
            html += `
                <tr>
                    <td><strong style="color: #667eea;">${key}</strong></td>
                    <td>${data.hwid ? '🖥️ PC' : '📱 Mobile'}</td>
                    <td><span class="device-id" title="${deviceId}">${deviceId.substring(0, 20)}...</span></td>
                    <td>${data.platform || 'Unknown'}</td>
                    <td>${data.createdAt ? new Date(data.createdAt).toLocaleString() : 'Unknown'}</td>
                    <td>${data.lastUsed ? new Date(data.lastUsed).toLocaleString() : 'Never'}</td>
                    <td>Unknown</td>
                </tr>
            `;
        }
    }
    
    if (!hasDevices) {
        html += '<tr><td colspan="7" style="text-align: center; color: #666; padding: 40px;">No devices bound yet</td></tr>';
    }
    
    html += `
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Tab 4: Activity Logs -->
                <div id="logs" class="tab-content">
                    <div class="table-container">
                        <div class="table-header">
                            <h2><i>📊</i> Recent Activity Log</h2>
                            <span style="color: #888;">Last 100 events</span>
                        </div>
                        
                        <div class="log-container">
    `;
    
    if (usageLog.length === 0) {
        html += '<div style="text-align: center; padding: 40px; color: #666;">No activity yet</div>';
    } else {
        for (let i = Math.max(0, usageLog.length - 100); i < usageLog.length; i++) {
            const log = usageLog[i];
            let statusClass = 'status-warning';
            
            if (log.status.includes('VALID') || log.status.includes('BOUND') || log.status.includes('CREATED')) {
                statusClass = 'status-success';
            } else if (log.status.includes('INVALID') || log.status.includes('BLACKLISTED') || log.status.includes('BANNED')) {
                statusClass = 'status-failed';
            }
            
            html += `
                <div class="log-entry">
                    <span class="log-time">${new Date(log.time).toLocaleString()}</span>
                    <span class="log-key">${log.key}</span>
                    <span class="log-status ${statusClass}">${log.status}</span>
                    <span style="color: #888;">${log.ip || ''}</span>
                </div>
            `;
        }
    }
    
    html += `
                        </div>
                    </div>
                </div>
                
                <!-- Tab 5: Staff Actions -->
                <div id="staff" class="tab-content">
                    <div class="table-container">
                        <div class="table-header">
                            <h2><i>👥</i> Staff Action Log</h2>
                        </div>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Action</th>
                                    <th>Key/Details</th>
                                    <th>Performed By</th>
                                </tr>
                            </thead>
                            <tbody>
    `;
    
    if (staffActions.length === 0) {
        html += '<tr><td colspan="4" style="text-align: center; padding: 40px;">No staff actions yet</td></tr>';
    } else {
        staffActions.slice().reverse().forEach(action => {
            html += `
                <tr>
                    <td>${new Date(action.time).toLocaleString()}</td>
                    <td><span class="status-badge ${action.action.includes('BAN') ? 'status-banned' : 'status-success'}">${action.action}</span></td>
                    <td>${action.key || action.count + ' keys'}</td>
                    <td>${action.performedBy}</td>
                </tr>
            `;
        });
    }
    
    html += `
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Tab 6: Advanced Stats -->
                <div id="stats" class="tab-content">
                    <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr);">
                        <div class="stat-card">
                            <div class="stat-title">Keys Created Today</div>
                            <div class="stat-number">${Object.values(whitelist).filter(l => new Date(l.createdAt).toDateString() === new Date().toDateString()).length}</div>
                        </div>
                        
                        <div class="stat-card">
                            <div class="stat-title">Keys Bound Today</div>
                            <div class="stat-number">${Object.values(whitelist).filter(l => l.lastUsed && new Date(l.lastUsed).toDateString() === new Date().toDateString()).length}</div>
                        </div>
                        
                        <div class="stat-card">
                            <div class="stat-title">Avg Devices/Key</div>
                            <div class="stat-number">${(totalDevices / totalBound || 0).toFixed(2)}</div>
                        </div>
                        
                        <div class="stat-card">
                            <div class="stat-title">Success Rate</div>
                            <div class="stat-number">${((usageLog.filter(l => l.status.includes('VALID')).length / usageLog.length) * 100 || 0).toFixed(1)}%</div>
                        </div>
                    </div>
                    
                    <div class="table-container">
                        <h3>Expiring Soon (Next 7 Days)</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Key</th>
                                    <th>Expires</th>
                                    <th>Days Left</th>
                                    <th>Note</th>
                                </tr>
                            </thead>
                            <tbody>
    `;
    
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    let expiringCount = 0;
    for (const [key, data] of Object.entries(whitelist)) {
        if (data.expires) {
            const expireDate = new Date(data.expires);
            if (expireDate > now && expireDate < nextWeek) {
                expiringCount++;
                const daysLeft = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));
                html += `
                    <tr>
                        <td>${key}</td>
                        <td>${data.expires}</td>
                        <td>${daysLeft} days</td>
                        <td>${data.note || '—'}</td>
                    </tr>
                `;
            }
        }
    }
    
    if (expiringCount === 0) {
        html += '<tr><td colspan="4" style="text-align: center; color: #666;">No keys expiring soon</td></tr>';
    }
    
    html += `
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Footer -->
                <div class="footer">
                    <p>Ultimate HWID Authentication System v3.0 • Staff Access Only • ${new Date().toLocaleDateString()}</p>
                    <p style="margin-top: 5px;">Total Keys: ${Object.keys(whitelist).length} | Bound: ${totalBound} | Devices: ${totalDevices} | Validations: ${stats.totalValidations}</p>
                </div>
            </div>
            
            <!-- Key Details Modal -->
            <div id="keyModal" class="modal">
                <div class="modal-content">
                    <h3 id="modalTitle">Key Details</h3>
                    <div id="modalContent"></div>
                    <button class="generate-btn" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                </div>
            </div>
            
            <script>
                let currentGeneratedKey = '';
                
                function switchTab(tabId) {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    
                    event.target.classList.add('active');
                    document.getElementById(tabId).classList.add('active');
                }
                
                async function generateKey() {
                    const prefix = document.getElementById('keyPrefix').value;
                    const format = document.getElementById('keyFormat').value;
                    const maxDevices = document.getElementById('maxDevices').value;
                    const expires = document.getElementById('expires').value;
                    const note = document.getElementById('keyNote').value;
                    const createdBy = document.getElementById('createdBy').value;
                    
                    const [len, sections] = format.split('-');
                    
                    const response = await fetch('/create-key', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            adminKey: 'madmoney072',
                            prefix: prefix,
                            length: parseInt(len),
                            sections: parseInt(sections),
                            maxDevices: parseInt(maxDevices),
                            expires: expires,
                            note: note,
                            createdBy: createdBy
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        currentGeneratedKey = result.key;
                        document.getElementById('generatedKey').textContent = result.key;
                        document.getElementById('resultDevices').textContent = result.details.maxDevices;
                        document.getElementById('resultExpires').textContent = result.details.expires || 'Never';
                        document.getElementById('keyResult').classList.add('show');
                    } else {
                        alert('Failed to generate key: ' + result.message);
                    }
                }
                
                async function bulkGenerateKeys() {
                    const count = document.getElementById('bulkCount').value;
                    const prefix = document.getElementById('bulkPrefix').value;
                    const maxDevices = document.getElementById('bulkMaxDevices').value;
                    const expires = document.getElementById('bulkExpires').value;
                    const note = document.getElementById('bulkNote').value;
                    
                    const response = await fetch('/bulk-create-keys', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            adminKey: 'madmoney072',
                            count: parseInt(count),
                            prefix: prefix,
                            maxDevices: parseInt(maxDevices),
                            expires: expires,
                            note: note
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        const keyList = document.getElementById('bulkKeyList');
                        keyList.innerHTML = result.keys.map(k => '<div>' + k + '</div>').join('');
                        document.getElementById('bulkKeyResult').classList.add('show');
                    } else {
                        alert('Failed to generate keys: ' + result.message);
                    }
                }
                
                function copyGeneratedKey() {
                    navigator.clipboard.writeText(currentGeneratedKey);
                    const btn = event.target;
                    const originalText = btn.textContent;
                    btn.textContent = 'Copied!';
                    setTimeout(() => btn.textContent = originalText, 2000);
                }
                
                function copyAllBulkKeys() {
                    const keyDivs = document.querySelectorAll('#bulkKeyList div');
                    const keys = Array.from(keyDivs).map(div => div.textContent).join('\\n');
                    navigator.clipboard.writeText(keys);
                    
                    const btn = event.target;
                    const originalText = btn.textContent;
                    btn.textContent = 'Copied All!';
                    setTimeout(() => btn.textContent = originalText, 2000);
                }
                
                function filterKeys() {
                    const search = document.getElementById('keySearch').value.toLowerCase();
                    const statusFilter = document.getElementById('statusFilter').value;
                    const rows = document.querySelectorAll('#keysTable tbody tr');
                    
                    rows.forEach(row => {
                        const key = row.cells[0].textContent.toLowerCase();
                        const status = row.cells[1].textContent.toLowerCase().trim();
                        
                        let matchesSearch = key.includes(search);
                        let matchesStatus = statusFilter === 'all' || status.includes(statusFilter);
                        
                        row.style.display = matchesSearch && matchesStatus ? '' : 'none';
                    });
                }
                
                async function resetKey(key) {
                    if (confirm('Are you sure you want to reset this key? This will unbind all devices.')) {
                        const response = await fetch('/reset', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                adminKey: 'madmoney072',
                                licenseKey: key
                            })
                        });
                        
                        const result = await response.json();
                        if (result.success) {
                            alert('Key reset successfully');
                            location.reload();
                        }
                    }
                }
                
                async function banKey(key) {
                    const reason = prompt('Enter ban reason:');
                    if (reason !== null) {
                        const response = await fetch('/toggle-ban', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                adminKey: 'madmoney072',
                                licenseKey: key,
                                ban: true,
                                reason: reason
                            })
                        });
                        
                        const result = await response.json();
                        if (result.success) {
                            alert('Key banned successfully');
                            location.reload();
                        }
                    }
                }
                
                async function unbanKey(key) {
                    if (confirm('Unban this key?')) {
                        const response = await fetch('/toggle-ban', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                adminKey: 'madmoney072',
                                licenseKey: key,
                                ban: false
                            })
                        });
                        
                        const result = await response.json();
                        if (result.success) {
                            alert('Key unbanned successfully');
                            location.reload();
                        }
                    }
                }
                
                async function deleteKey(key) {
                    if (confirm('⚠️ Are you ABSOLUTELY sure you want to delete this key? This cannot be undone!')) {
                        const response = await fetch('/delete-key', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                adminKey: 'madmoney072',
                                licenseKey: key
                            })
                        });
                        
                        const result = await response.json();
                        if (result.success) {
                            alert('Key deleted successfully');
                            location.reload();
                        }
                    }
                }
                
                function viewKeyDetails(key) {
                    // Find key details from whitelist
                    fetch('/stats?adminKey=madmoney072')
                        .then(r => r.json())
                        .then(data => {
                            // This would need a proper endpoint, but for demo we'll reload
                            alert('View details feature - would show full key info');
                        });
                }
                
                function closeModal() {
                    document.getElementById('keyModal').classList.remove('show');
                }
            </script>
        </body>
        </html>
    `;
    
    res.send(html);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ ULTIMATE HWID Server running on port ${PORT}`);
    console.log(`📝 Validation endpoint: http://localhost:${PORT}/validate`);
    console.log(`👀 Admin panel: http://localhost:${PORT}/admin?password=madmoney072`);
    console.log(`📊 Active licenses: ${Object.keys(whitelist).length}`);
    console.log(`🚀 Multi-device support enabled up to 999 devices per key`);
});
