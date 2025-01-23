<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once(__DIR__ . '/../vendor/autoload.php');

use Facebook\WebDriver\Remote\RemoteWebDriver;
use Facebook\WebDriver\Remote\DesiredCapabilities;
use Facebook\WebDriver\WebDriverBy;
use Facebook\WebDriver\WebDriverExpectedCondition;

header('Content-Type: application/json');

// --------------------------------------------------------------------------------
// 1. Simple Authorization Check: "Bearer your-secret-token"
// --------------------------------------------------------------------------------
function getAuthorizationHeader() {
    $headers = getallheaders();
    return $headers['Authorization'] ?? null;
}

$authToken = "your-secret-token"; // sama väärtus, mida kasutasid frontendis
$authHeader = getAuthorizationHeader();

// Lihtne kontroll, kas header kattub. Muidu tagastame 403
if (!$authHeader || $authHeader !== "Bearer $authToken") {
    http_response_code(403);
    echo json_encode(["error" => "Unauthorized access"]);
    exit();
}

// --------------------------------------------------------------------------------
// 2. Main Scraping Logic
// --------------------------------------------------------------------------------
try {
    // Selenium WebDriver URL (muuda vastavalt oma Selenium setupile)
    $host = 'http://26.13.134.10:4444/wd/hub';
    $driver = RemoteWebDriver::create($host, DesiredCapabilities::chrome());

    $url = $_GET['url'] ?? null;
    if (!$url) {
        throw new Exception("URL parameter is required");
    }

    // 2.1. Avame lehe
    $driver->get($url);

    // Ootame kuni <ol class="row"> on DOM-is (books.toscrape.com näide)
    $driver->wait(15)->until(
        WebDriverExpectedCondition::presenceOfElementLocated(WebDriverBy::cssSelector('ol.row'))
    );

    // Haarame HTML-i
    $html = $driver->getPageSource();
    $dom = new DOMDocument();
    @$dom->loadHTML($html);
    $xpath = new DOMXPath($dom);

    // ------------------------------------------------------------------------
    // 2.2. Kategooriate tuvastamine
    // ------------------------------------------------------------------------
    $categories = [];
    $categoryNodes = $xpath->query('//div[@class="side_categories"]//ul[@class="nav nav-list"]//a');
    foreach ($categoryNodes as $node) {
        $categoryName = trim($node->textContent);
        if (!empty($categoryName)) {
            $categories[$categoryName] = ($categories[$categoryName] ?? 0) + 1;
        }
    }
    arsort($categories);

    // ------------------------------------------------------------------------
    // 2.3. Toodete, hindade, reitingute tuvastamine
    // ------------------------------------------------------------------------
    $products = [];
    $discountedProducts = [];

    $productNodes = $xpath->query('//ol[@class="row"]//article[@class="product_pod"]');
    foreach ($productNodes as $node) {
        // Pealkiri
        $titleNode = $xpath->query('.//h3/a', $node)->item(0);
        $title = $titleNode ? trim($titleNode->textContent) : '';

        // Hind
        $priceNode = $xpath->query('.//p[@class="price_color"]', $node)->item(0);
        $price = $priceNode ? trim($priceNode->textContent) : '';

        // Reiting (star-rating One/Two/Three/...)
        $ratingNode = $xpath->query('.//p[contains(@class, "star-rating")]', $node)->item(0);
        $ratingClass = $ratingNode ? trim($ratingNode->getAttribute('class')) : '';
        $rating = 0;
        if (strpos($ratingClass, 'Five') !== false) $rating = 5;
        elseif (strpos($ratingClass, 'Four') !== false) $rating = 4;
        elseif (strpos($ratingClass, 'Three') !== false) $rating = 3;
        elseif (strpos($ratingClass, 'Two') !== false) $rating = 2;
        elseif (strpos($ratingClass, 'One') !== false) $rating = 1;

        // Vaata, kas on discount_price
        $discountPriceNode = $xpath->query('.//p[@class="discount_price"]', $node)->item(0);
        $discountedPrice = $discountPriceNode ? trim($discountPriceNode->textContent) : null;

        // Arvutame sooduse protsendi
        $discountPercentage = null;
        if ($discountedPrice) {
            $originalVal = floatval(preg_replace('/[^0-9.]/', '', $price));
            $discountVal = floatval(preg_replace('/[^0-9.]/', '', $discountedPrice));
            if ($originalVal > 0 && $discountVal > 0 && $discountVal < $originalVal) {
                $discountPercentage = round((1 - ($discountVal / $originalVal)) * 100);
            }
        }

        // Ehita tooteinfo massiiv
        $productData = [
            "title" => $title,
            "price" => $price,
            "rating" => $rating
        ];

        // Kui on discount
        if ($discountPercentage) {
            $productData["discount_price"] = $discountedPrice;
            $productData["discount_percentage"] = $discountPercentage;
            $discountedProducts[] = $productData;
        }

        $products[] = $productData;
    }

    // Sorteerime reitingu järgi kahanevalt
    usort($products, fn($a, $b) => $b['rating'] - $a['rating']);

    // ------------------------------------------------------------------------
    // 3. Tagastame JSON
    // ------------------------------------------------------------------------
    echo json_encode([
        "url"                => $url,
        "popular_categories" => $categories,
        "products"           => $products,
        "discounted_products"=> $discountedProducts,
        "timestamp"          => date('c')
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
} finally {
    if (isset($driver)) {
        $driver->quit();
    }
}
