package proxy

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// InjectScript injects JavaScript into HTML responses
func InjectScript(resp *http.Response, scriptURL string) error {
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

	// Create the injection script tag
	injection := fmt.Sprintf(`<script src="%s"></script>`, scriptURL)

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
