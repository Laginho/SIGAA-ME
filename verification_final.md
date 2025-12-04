--- SIGAA Scraper Verification ---
SIGAA: Service initialized with Playwright and HttpScraper

[1/4] Logging in...
SIGAA: Starting Playwright login...
Playwright: Launching browser...
Playwright: Navigating to login page...
Playwright: Filling in credentials...
Playwright: Clicking login button...
Playwright: Waiting for navigation...
Playwright: Current URL after login: https://si3.ufc.br/sigaa/telaAvisoLogon.jsf
Playwright: Login successful! Extracting user data...
Playwright: Extracted user name: 
						 BRUNO DELUIZ LAGE
					
Playwright: Found cookies: JSESSIONID
Playwright: Keeping session alive for cookie refresh
SIGAA: Login successful!
[HttpScraper] Cookies set. Count: 1

[2/4] Fetching courses...
SIGAA: Fetching courses using Playwright...
Playwright: Launching browser to fetch courses...
Playwright: Injecting stored session cookies...
Playwright: Navigating to home page...
Playwright: Looking for "Menu Discente" link...
Playwright: Clicked Menu Discente, current URL: https://si3.ufc.br/sigaa/portais/discente/discente.jsf
Playwright: Extracting courses from page...
Playwright: Found courses: 8
Playwright: Sample courses: [
  {
    id: '509238',
    code: 'CB0699',
    name: 'ÁLGEBRA APLICADA I',
    period: 'TER 18:00-20:00'
  },
  {
    id: '510158',
    code: 'CB0706',
    name: 'ÁLGEBRA LINEAR',
    period: 'SEG 10:00-12:00'
  },
  {
    id: '510144',
    code: 'CB0705',
    name: 'CÁLCULO FUNDAMENTAL II',
    period: 'SEG 08:00-10:00'
  }
]
SIGAA: Found courses: 8
Found 8 courses.

[3/4] Searching for course "FUNDAMENTOS MATEMÁTICOS"...
ReferenceError: courseWithFiles is not defined
    at main (C:\Users\Bruno Lage\Desktop\Pastinha\Programas\Projects\SIGAA-ME\verify-scraper.ts:50:5)
