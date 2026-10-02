const navToggle=document.getElementById("navToggle"),navLinks=document.getElementById("navLinks");
navToggle.addEventListener("click",()=>{const open=navLinks.classList.toggle("open");navToggle.setAttribute("aria-expanded",open);navToggle.innerHTML=open?'<i class="fa-solid fa-xmark"></i>':'<i class="fa-solid fa-bars"></i>'});
document.querySelectorAll(".nav-links a").forEach(a=>a.addEventListener("click",()=>navLinks.classList.remove("open")));

const themeToggle=document.getElementById("themeToggle");
const savedTheme=localStorage.getItem("jamix-theme");
if(savedTheme==="dark")document.body.classList.add("dark");
themeToggle.addEventListener("click",()=>{document.body.classList.toggle("dark");localStorage.setItem("jamix-theme",document.body.classList.contains("dark")?"dark":"light");themeToggle.innerHTML=document.body.classList.contains("dark")?'<i class="fa-solid fa-sun"></i>':'<i class="fa-solid fa-moon"></i>'});

const filters=document.querySelectorAll(".filter"), projects=document.querySelectorAll(".project");
filters.forEach(btn=>btn.addEventListener("click",()=>{filters.forEach(b=>b.classList.remove("active"));btn.classList.add("active");const f=btn.dataset.filter;projects.forEach(p=>p.style.display=f==="all"||p.dataset.category===f?"block":"none")}));

const modal=document.getElementById("projectModal"),modalTitle=document.getElementById("modalTitle"),modalDesc=document.getElementById("modalDesc"),modalImage=document.getElementById("modalImage");
projects.forEach(p=>p.addEventListener("click",()=>{modalTitle.textContent=p.dataset.title;modalDesc.textContent=p.dataset.desc;modalImage.className="modal-image "+p.querySelector(".project-img").classList[1];modal.classList.add("open");modal.setAttribute("aria-hidden","false")}));
function closeModal(){modal.classList.remove("open");modal.setAttribute("aria-hidden","true")}
document.getElementById("modalClose").addEventListener("click",closeModal);modal.addEventListener("click",e=>{if(e.target===modal)closeModal()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});

const search=document.getElementById("newsSearch"),cat=document.getElementById("newsCategory"),news=[...document.querySelectorAll(".news-card")];
function filterNews(){const q=search.value.toLowerCase(),c=cat.value;news.forEach(n=>{const okText=n.innerText.toLowerCase().includes(q),okCat=c==="all"||n.dataset.category===c;n.style.display=okText&&okCat?"block":"none"})}
search.addEventListener("input",filterNews);cat.addEventListener("change",filterNews);

document.getElementById("contactForm").addEventListener("submit",e=>{e.preventDefault();document.getElementById("formNote").textContent="Thank you. Your message is ready to be connected to your preferred email/backend service.";e.target.reset()});
document.getElementById("newsletterForm").addEventListener("submit",e=>{e.preventDefault();alert("Thanks for subscribing to JAMIX PRO UG.");e.target.reset()});

const backTop=document.getElementById("backTop");window.addEventListener("scroll",()=>backTop.classList.toggle("show",scrollY>500));backTop.addEventListener("click",()=>scrollTo({top:0,behavior:"smooth"}));
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add("visible")}),{threshold:.12});document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));
