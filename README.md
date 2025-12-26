# 📄 Version-Controlled LaTeX Resume (with Automatic PDF Conversion)

Yes — it really does what it says.

I built this repository to version-control my résumé and automatically generate a fresh PDF every time I push changes, thanks to GitHub Actions.  
I used to edit my LaTeX file, compile it manually, and *only then* notice formatting issues or typos. Since I tweak my résumé often, I figured… why not automate the boring part?

So this repo exists to fix exactly that — and you can clone it to automate your workflow too.

---

## 🚀 What This Repo Does

- Stores your LaTeX résumé in version control  
- Automatically compiles it into a PDF on every push  
- Uploads the PDF as a downloadable artifact  
- Saves you from manually running LaTeX for every small update  

If you regularly update your résumé, this setup will make your life much easier.

---

## ⚙️ How It Works

A GitHub Actions workflow handles the automation:

1. Checks out the repo  
2. Compiles the `.tex` file  
3. Uploads the generated PDF  

All you need to do is push your changes.

### **Workflow Used**

```yaml
name: Build Resume PDF

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repo
        uses: actions/checkout@v3

      - name: Compile LaTeX
        uses: xu-cheng/latex-action@v3
        with:
          root_file: resume.tex

      - name: Upload PDF
        uses: actions/upload-artifact@v3
        with:
          name: resume-pdf
          path: resume.pdf
````

---

## 🧪 Local Compilation (Optional)

If you prefer compiling the PDF yourself:

```bash
latexmk -pdf resume.tex
```

Or upload the `.tex` file to Overleaf for automatic compilation.

---

## 📝 What’s Next?

I'm working on automating a **Word (.docx) version** of the résumé as well.
This requires more than just a workflow job, but it’s something I plan to add.

---

## 🤝 Feel Free to Use This

Clone it, customize it, or use it as the base for your own automated résumé setup.
If you have ideas to improve it, PRs are always welcome!
