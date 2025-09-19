// components/AzureMapsTest.js
import React, { useState } from 'react';

function getAzureMapsKey() {
  return process.env.NEXT_PUBLIC_AZURE_MAPS_KEY;
}

export default function AzureMapsTest() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const testAzureMapsAPI = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const subscriptionKey = getAzureMapsKey();
    console.log("Testing Azure Maps with key:", subscriptionKey ? "Found" : "Missing");

    if (!subscriptionKey) {
      setError("Azure Maps subscription key missing");
      setLoading(false);
      return;
    }

    try {
      // Test with a simple search request first
      const searchUrl = `https://atlas.microsoft.com/search/fuzzy/json?api-version=1.0&query=San Francisco&subscription-key=${subscriptionKey}`;
      
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Azure Maps API Error (${response.status}):`, errorText);
        setError(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      } else {
        const json = await response.json();
        console.log("Azure Maps Response:", json);
        setResult(json);
      }
    } catch (err) {
      console.error("Error testing Azure Maps:", err);
      setError("Error testing Azure Maps: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '20px' }}>
      <h3>Azure Maps API Test</h3>
      <button onClick={testAzureMapsAPI} disabled={loading}>
        {loading ? 'Testing...' : 'Test Azure Maps API'}
      </button>
      
      {error && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {result && (
        <div style={{ marginTop: '10px' }}>
          <strong>Success!</strong> Found {result.results?.length || 0} results
          <pre style={{ background: '#f5f5f5', padding: '10px', fontSize: '12px' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
