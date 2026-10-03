<?php
error_reporting(0);
ini_set('display_errors', 0);

$nodePort = 5060;
$runnerScript = __DIR__ . '/run.sh';

function getTargetHosts() {
    $httpHost = $_SERVER['HTTP_HOST'] ?? '';
    $isLocal = strpos($httpHost, 'localhost') !== false || strpos($httpHost, '127.0.0.1') !== false;
    if ($isLocal) {
        return ['127.0.0.1'];
    }
    // On Hostinger shared hosting with CloudLinux CageFS, 145.79.25.57 connects directly across namespaces
    return ['145.79.25.57', '127.0.0.1'];
}

function makeCurlRequest($nodePort) {
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $hosts = getTargetHosts();
    $lastResult = null;

    foreach ($hosts as $host) {
        $url = 'http://' . $host . ':' . $nodePort . $uri;

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HEADER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

        $headers = array();
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $name => $value) {
                $nameLower = strtolower($name);
                if ($nameLower !== 'host' && $nameLower !== 'content-type' && $nameLower !== 'content-length') {
                    $headers[] = $name . ': ' . $value;
                }
            }
        }

        $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';

        if (strpos($contentType, 'multipart/form-data') !== false) {
            $postData = $_POST;
            foreach ($_FILES as $key => $file) {
                if ($file['error'] === UPLOAD_ERR_OK && !empty($file['tmp_name'])) {
                    $postData[$key] = new CURLFile(
                        $file['tmp_name'],
                        $file['type'],
                        $file['name']
                    );
                }
            }
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        } else {
            if (!empty($contentType)) {
                $headers[] = 'Content-Type: ' . $contentType;
            }
            $body = file_get_contents('php://input');
            if (!empty($body)) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            }
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $response = curl_exec($ch);
        $error = curl_error($ch);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $lastResult = array('response' => $response, 'error' => $error, 'headerSize' => $headerSize, 'httpCode' => $httpCode);

        if ($response !== false && !empty($response)) {
            return $lastResult;
        }
    }

    return $lastResult ?? array('response' => false, 'error' => 'No host reachable', 'headerSize' => 0, 'httpCode' => 502);
}

function isExecEnabled() {
    $disabled = explode(',', (string)ini_get('disable_functions'));
    $disabled = array_map('trim', $disabled);
    return function_exists('exec') && !in_array('exec', $disabled);
}

// 1. Initial attempt
$result = makeCurlRequest($nodePort);

// 2. Auto-start backend if stopped
if ($result['response'] === false || empty($result['response'])) {
    if (file_exists($runnerScript) && isExecEnabled()) {
        exec("bash " . escapeshellarg($runnerScript) . " > /dev/null 2>&1 &");
        usleep(1500000); // Wait 1.5s for process startup
        $result = makeCurlRequest($nodePort);
    }
}

if ($result['response'] === false || empty($result['response'])) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(array(
        'error' => array(
            'code' => 'BACKEND_STARTING',
            'message' => 'MCP Hub Backend is initializing. Please refresh in a moment.'
        )
    ));
    exit;
}

if (!empty($result['httpCode'])) {
    http_response_code($result['httpCode']);
}

$headerStr = substr($result['response'], 0, (int)$result['headerSize']);
$bodyStr = substr($result['response'], (int)$result['headerSize']);

$headerLines = explode("\r\n", $headerStr);
foreach ($headerLines as $h) {
    if (!empty($h) && !preg_match('/^Transfer-Encoding:/i', $h) && !preg_match('/^HTTP\//i', $h)) {
        header($h);
    }
}

echo $bodyStr;
