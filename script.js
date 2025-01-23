// script.js
document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const url = document.getElementById('urlInput').value.trim();
    const errorMessage = document.getElementById('errorMessage');
    const progressBar = document.getElementById("progressBar");

    // Puhastame võimalikud vanad teated/graafikud
    errorMessage.textContent = '';
    d3.select("#categoriesChart").html("");
    d3.select("#productsChart").html("");
    d3.select("#discountsChart").html("");
    progressBar.style.display = "none";
    progressBar.value = 0;

    if (!url) {
        errorMessage.textContent = 'Please enter a URL.';
        return;
    }

    try {
        // Näitame progressBar, et kasutaja näeks "töötlemist"
        progressBar.style.display = "block";
        progressBar.value = 30; // meelevaldne algus

        // Lisa vajaliku Authorization header:
        const response = await fetch(`scrape.php?url=${encodeURIComponent(url)}`, {
            headers: {
                "Authorization": "Bearer your-secret-token"
            }
        });
        
        if (!response.ok) {
            throw new Error("Server error: " + response.statusText);
        }

        progressBar.value = 60;

        const data = await response.json();

        progressBar.value = 80;

        // 1) Popular categories -> D3 diagram
        if (data.popular_categories && Object.keys(data.popular_categories).length > 0) {
            createCategoriesChart(data.popular_categories);
        } else {
            errorMessage.textContent = "No categories found.";
        }

        // 2) Products -> D3 diagram (price vs. title)
        if (data.products && data.products.length > 0) {
            createProductsChart(data.products);
        } else {
            errorMessage.textContent = "No products found.";
        }

        // 3) Discounted products -> D3 diagram (discount_percentage vs. title)
        if (data.discounted_products && data.discounted_products.length > 0) {
            createDiscountsChart(data.discounted_products);
        } else {
            // soovi korral lisa teade, kui pole soodustooteid
        }

        progressBar.value = 100;
        // Lisa väike viivitus, siis peida progressBar, et visuaalselt "valmis"
        setTimeout(() => {
            progressBar.style.display = "none";
        }, 1000);

    } catch (error) {
        errorMessage.textContent = `Error: ${error.message}`;
        progressBar.style.display = "none";
    }
});


/**
 * Popular categories -> bar chart
 * categoriesObj = { "Travel": 2, "Mystery": 5, ... }
 */
function createCategoriesChart(categoriesObj) {
    // Teeme data massiivi: [{ name: 'Travel', count: 2 }, ... ]
    const data = Object.entries(categoriesObj).map(([name, count]) => ({ name, count }));

    // Dimensioonid
    const width = 500, height = 300, margin = 40;
    const svg = d3.select("#categoriesChart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Skaalad
    const x = d3.scaleBand()
        .domain(data.map(d => d.name))
        .range([margin, width - margin])
        .padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .range([height - margin, margin]);

    // Teljed
    svg.append("g")
       .attr("transform", `translate(0,${height - margin})`)
       .call(d3.axisBottom(x).tickFormat(d => d.length > 8 ? d.substring(0,8)+"..." : d));

    svg.append("g")
       .attr("transform", `translate(${margin},0)`)
       .call(d3.axisLeft(y));

    // Tulpade joonistus
    svg.selectAll(".bar")
       .data(data)
       .enter()
       .append("rect")
       .attr("class", "bar")
       .attr("x", d => x(d.name))
       .attr("y", d => y(d.count))
       .attr("width", x.bandwidth())
       .attr("height", d => (height - margin) - y(d.count))
       .attr("fill", "#3498db");
}

/**
 * Products chart -> Näiteks tulpdiagramm (product title vs price)
 * products = [
 *   { title: "Book A", price: "£12.99", rating: 4 }, 
 *   { title: "Book B", price: "£5.00",  rating: 5 }, 
 *   ...
 * ]
 */
function createProductsChart(products) {
    // Teeme data massiivi: [{ name: "...", value: 12.99 }, ... ]
    const data = products.map(p => {
        const numericPrice = parseFloat(p.price.replace(/[^0-9.]/g, '')) || 0;
        return { name: p.title, value: numericPrice };
    });

    const width = 500, height = 300, margin = 40;
    const svg = d3.select("#productsChart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const x = d3.scaleBand()
        .domain(data.map(d => d.name))
        .range([margin, width - margin])
        .padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value)])
        .range([height - margin, margin]);

    svg.append("g")
       .attr("transform", `translate(0,${height - margin})`)
       .call(d3.axisBottom(x).tickFormat(d => d.length > 8 ? d.substring(0,8)+"..." : d));

    svg.append("g")
       .attr("transform", `translate(${margin},0)`)
       .call(d3.axisLeft(y));

    svg.selectAll(".bar")
       .data(data)
       .enter()
       .append("rect")
       .attr("class", "bar")
       .attr("x", d => x(d.name))
       .attr("y", d => y(d.value))
       .attr("width", x.bandwidth())
       .attr("height", d => (height - margin) - y(d.value))
       .attr("fill", "#9b59b6");
}

/**
 * Discounted products -> bar chart (title vs discount_percentage)
 * discounted_products = [
 *   { title: "Book A", price: "£12.99", rating: 4, discount_price: "£9.99", discount_percentage: 23 }, 
 *   ...
 * ]
 */
function createDiscountsChart(discountedProducts) {
    // data: [{ name: "...", value: 23 }, ... ]
    const data = discountedProducts.map(p => ({
        name: p.title,
        value: p.discount_percentage
    }));

    const width = 500, height = 300, margin = 40;
    const svg = d3.select("#discountsChart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const x = d3.scaleBand()
        .domain(data.map(d => d.name))
        .range([margin, width - margin])
        .padding(0.1);

    const maxVal = d3.max(data, d => d.value) || 0;
    const y = d3.scaleLinear()
        .domain([0, maxVal])
        .range([height - margin, margin]);

    svg.append("g")
       .attr("transform", `translate(0,${height - margin})`)
       .call(d3.axisBottom(x).tickFormat(d => d.length > 8 ? d.substring(0,8)+"..." : d));

    svg.append("g")
       .attr("transform", `translate(${margin},0)`)
       .call(d3.axisLeft(y));

    svg.selectAll(".bar")
       .data(data)
       .enter()
       .append("rect")
       .attr("class", "bar")
       .attr("x", d => x(d.name))
       .attr("y", d => y(d.value))
       .attr("width", x.bandwidth())
       .attr("height", d => (height - margin) - y(d.value))
       .attr("fill", "#e74c3c");
}
