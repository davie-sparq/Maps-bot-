

async function verify() {
    try {
        const response = await fetch('http://localhost:3001/api/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_name: 'Java House', location: 'Nairobi' })
        });
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

verify();
