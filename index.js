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
    //   expires: null             // null = never expires, or "2024-12-31"
    // }
    
    // Add your test key here
    "TEST-KEY-123": {
        hwid: null,
        fingerprint: null,
        bindingMethod: null,
        maxDevices: 1,
        note: "Test key for development",
        expires: null,
        createdAt: new Date().toISOString()
    },
    
    // Add more keys as needed
    "VIP-JOHN-2024": {
        hwid: null,
        fingerprint: null,
        bindingMethod: null,
        maxDevices: 1,
        note: "John's personal key",
        expires: null,
        createdAt: new Date().toISOString()
    },
    
    "VIP-SARAH-2024": {
        hwid: null,
        fingerprint: null,
        bindingMethod: null,
        maxDevices: 2,  // Can use on 2 devices
        note: "Sarah's key (laptop + phone)",
        expires: "2024-12-31",
        createdAt: new Date().toISOString()
    }
};

// Blacklisted HWIDs or fingerprints
const blacklist = {
    // "banned_hwid_here": true,
    // "banned_fingerprint_here": true
};

// Track usage (optional - helps you see who's using your script)
const usageLog = [];
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
            username
        } = req.body;
        
        console.log(`\n🔍 Validation attempt:`);
        console.log(`   Key: ${key}`);
        console.log(`   User: ${username || 'unknown'} (ID: ${userId || 'unknown'})`);
        console.log(`   Platform: ${platform || 'unknown'}`);
        console.log(`   HWID Available: ${hwid ? '✅ YES' : '❌ NO'}`);
        console.log(`   Executor: ${executor || 'unknown'}`);
        
        // Check blacklist first
        if (hwid && blacklist[hwid]) {
            usageLog.push({ key, hwid, status: 'BLACKLISTED_HWID', time: new Date() });
            return res.json({ 
                success: false, 
                message: "This device has been blacklisted" 
            });
        }
        
        if (fingerprint && blacklist[fingerprint]) {
            usageLog.push({ key, fingerprint, status: 'BLACKLISTED_FINGERPRINT', time: new Date() });
            return res.json({ 
                success: false, 
                message: "This device has been blacklisted" 
            });
        }
        
        // Check if key exists
        if (!whitelist[key]) {
            usageLog.push({ key, hwid: hwid || fingerprint, status: 'INVALID_KEY', time: new Date() });
            return res.json({ 
                success: false, 
                message: "Invalid license key" 
            });
        }
        
        const license = whitelist[key];
        
        // Check if expired
        if (license.expires && new Date(license.expires) < new Date()) {
            usageLog.push({ key, hwid: hwid || fingerprint, status: 'EXPIRED', time: new Date() });
            return res.json({ 
                success: false, 
                message: "This license key has expired" 
            });
        }
        
        // CASE 1: Key not bound to anything yet (first time use)
        if (license.bindingMethod === null) {
            // Decide which binding method to use
            if (hwid) {
                // PC with HWID - bind using HWID (most secure)
                license.hwid = hwid;
                license.bindingMethod = 'hwid';
                usageLog.push({ key, hwid, status: 'BOUND_HWID', time: new Date() });
                
                return res.json({ 
                    success: true, 
                    message: "License activated and bound to this PC (HWID)",
                    bindingMethod: 'hwid'
                });
            } 
            else if (fingerprint) {
                // Mobile or no HWID - bind using fingerprint
                license.fingerprint = fingerprint;
                license.bindingMethod = 'fingerprint';
                usageLog.push({ key, fingerprint, status: 'BOUND_FINGERPRINT', time: new Date() });
                
                return res.json({ 
                    success: true, 
                    message: "License activated and bound to this device",
                    bindingMethod: 'fingerprint'
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
            if (hwid === license.hwid) {
                usageLog.push({ key, hwid, status: 'VALID_HWID', time: new Date() });
                return res.json({ 
                    success: true, 
                    message: "Access granted (HWID verified)",
                    bindingMethod: 'hwid'
                });
            } else {
                usageLog.push({ key, hwid, expected: license.hwid, status: 'HWID_MISMATCH', time: new Date() });
                return res.json({ 
                    success: false, 
                    message: "This license is bound to a different PC" 
                });
            }
        }
        
        // CASE 3: Key bound with fingerprint (mobile user)
        if (license.bindingMethod === 'fingerprint') {
            if (fingerprint === license.fingerprint) {
                usageLog.push({ key, fingerprint, status: 'VALID_FINGERPRINT', time: new Date() });
                return res.json({ 
                    success: true, 
                    message: "Access granted",
                    bindingMethod: 'fingerprint'
                });
            } else {
                usageLog.push({ key, fingerprint, expected: license.fingerprint, status: 'FINGERPRINT_MISMATCH', time: new Date() });
                return res.json({ 
                    success: false, 
                    message: "This license is bound to a different device" 
                });
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

// Simple home page to check if server is running
app.get('/', (req, res) => {
    res.send(`
        <h2>✅ HWID Server is Running!</h2>
        <p>Validation endpoint: <code>/validate</code></p>
        <p>Total validations: ${usageLog.length}</p>
        <p>Active licenses: ${Object.keys(whitelist).length}</p>
    `);
});

// Admin panel - view your licenses
app.get('/admin', (req, res) => {
    const password = req.query.password;
    
    if (password !== "YOUR_ADMIN_PASSWORD") {
        return res.send("Unauthorized - wrong password");
    }
    
    let html = `
        <style>
            body { font-family: Arial; padding: 20px; background: #1a1a1a; color: white; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #444; padding: 8px; text-align: left; }
            th { background: #333; }
            .hwid { color: #7cff7c; }
            .fp { color: #ff7c7c; }
        </style>
        <h2>📊 HWID License System Admin</h2>
        <p>Total validations: ${usageLog.length}</p>
        <h3>Licenses:</h3>
        <table>
        <tr>
            <th>Key</th>
            <th>Method</th>
            <th>HWID/Fingerprint</th>
            <th>Note</th>
            <th>Expires</th>
        </tr>
    `;
    
    for (const [key, data] of Object.entries(whitelist)) {
        const bindingInfo = data.bindingMethod === 'hwid' ? 
            `<span class="hwid">${data.hwid ? data.hwid.substring(0, 20) + '...' : 'None'}</span>` :
            data.bindingMethod === 'fingerprint' ?
            `<span class="fp">${data.fingerprint ? data.fingerprint.substring(0, 20) + '...' : 'None'}</span>` :
            'Not bound';
        
        html += `
        <tr>
            <td><strong>${key}</strong></td>
            <td>${data.bindingMethod || 'Not bound'}</td>
            <td>${bindingInfo}</td>
            <td>${data.note}</td>
            <td>${data.expires || 'Never'}</td>
        </tr>
        `;
    }
    
    html += `</table>`;
    
    // Add recent activity
    html += `<h3>Recent Activity:</h3><ul>`;
    for (let i = Math.max(0, usageLog.length - 10); i < usageLog.length; i++) {
        const log = usageLog[i];
        html += `<li>${new Date(log.time).toLocaleString()} - ${log.key} - ${log.status}</li>`;
    }
    html += `</ul>`;
    
    res.send(html);
});

// Reset endpoint (for when users get new devices)
app.post('/reset', (req, res) => {
    const { adminKey, licenseKey } = req.body;
    
    if (adminKey !== "YOUR_ADMIN_SECRET") {
        return res.json({ success: false, message: "Unauthorized" });
    }
    
    if (whitelist[licenseKey]) {
        whitelist[licenseKey].hwid = null;
        whitelist[licenseKey].fingerprint = null;
        whitelist[licenseKey].bindingMethod = null;
        
        res.json({ success: true, message: "License reset successfully" });
    } else {
        res.json({ success: false, message: "License not found" });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ HWID Server running on port ${PORT}`);
    console.log(`📝 Validation endpoint: http://localhost:${PORT}/validate`);
    console.log(`👀 Admin panel: http://localhost:${PORT}/admin?password=YOUR_ADMIN_PASSWORD`);
    console.log(`📊 Active licenses: ${Object.keys(whitelist).length}`);
});
