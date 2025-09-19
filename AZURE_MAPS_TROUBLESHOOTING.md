/* 
Azure Maps API Authentication Issues - Troubleshooting Guide

The 401 error with Bearer/SharedKey realm suggests:

1. API Key Issues:
   - Key might be expired or invalid
   - Key might not have permissions for Route service
   - Account might need billing enabled

2. Service Availability:
   - Route Range API might require paid subscription
   - Some Azure Maps services are not available in free tier
   - Account might need specific service plans enabled

3. Authentication Methods:
   - subscription-key in URL parameter (current method)
   - Ocp-Apim-Subscription-Key header
   - Bearer token authentication (requires AAD)
   - SharedKey authentication (requires account key)

4. Troubleshooting Steps:
   a. Verify API key in Azure Portal
   b. Check subscription status and billing
   c. Verify Route service is enabled
   d. Test with simpler APIs first (Search API)
   e. Check API documentation for changes

5. Alternative Solutions:
   - Use Google Maps Distance Matrix API instead
   - Use different isochrone service
   - Implement client-side approximation

To fix this issue, you may need to:
1. Log into Azure Portal
2. Check your Maps account status
3. Verify billing is enabled
4. Regenerate API keys if needed
5. Ensure Route service is included in your plan
*/
