module.exports = {
    STANDARD: {
        name: 'Standard',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        proxy: null,
        persistence: false,
        ttl: 0, // Infinite
        webPreferences: {}
    },
    MALWARE_ANALYST: {
        name: 'Malware Analyst',
        userAgent: 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1)', // XP
        proxy: 'socks5://127.0.0.1:9050', // Example Tor
        persistence: false,
        ttl: 600000, // 10 mins
        webPreferences: {
            images: true
        }
    },
    BANKING: {
        name: 'Banking',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15',
        proxy: null,
        persistence: true, // Use persistent partition
        ttl: 0,
        webPreferences: {}
    },
    LEGACY: {
        name: 'Legacy',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko',
        proxy: null,
        persistence: false,
        ttl: 0,
        webPreferences: {
            webgl: true, // Enable for legacy
            enableWebSQL: true
        }
    }
};