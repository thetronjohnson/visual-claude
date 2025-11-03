package proxy

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// InjectScript injects JavaScript and CSS into HTML responses
func InjectScript(resp *http.Response, baseURL string) error {
	// Only inject into HTML responses
	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "text/html") {
		return nil
	}

	// Read the response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}
	resp.Body.Close()

	// Create injection tags in correct order:
	// 1. Tailwind CSS (non-blocking)
	// 2. inject.css (custom styles)
	// 3. inject-utils.js (utilities - must load before main script)
	// 4. inject.js (main application script - deferred)
	// 5. Alpine.js (must load last with defer)
	injection := fmt.Sprintf(`
	<!-- Layrr - Alpine.js + Tailwind CSS + Custom Scripts -->
	<script src="%s/tailwind.min.js"></script>
	<link rel="stylesheet" href="%s/inject.css">
	<script src="%s/inject-utils.js"></script>
	<script defer src="%s/inject.js"></script>
	<script defer src="%s/alpine.min.js"></script>
`, baseURL, baseURL, baseURL, baseURL, baseURL)

	// Try to inject before </body>, otherwise before </html>, otherwise at the end
	bodyStr := string(body)
	var modified string

	if strings.Contains(bodyStr, "</body>") {
		modified = strings.Replace(bodyStr, "</body>", injection+"</body>", 1)
	} else if strings.Contains(bodyStr, "</html>") {
		modified = strings.Replace(bodyStr, "</html>", injection+"</html>", 1)
	} else {
		modified = bodyStr + injection
	}

	// Update the response body
	modifiedBytes := []byte(modified)
	resp.Body = io.NopCloser(bytes.NewReader(modifiedBytes))
	resp.ContentLength = int64(len(modifiedBytes))
	resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(modifiedBytes)))

	// Remove Content-Encoding header if present to avoid issues
	resp.Header.Del("Content-Encoding")

	return nil
}
