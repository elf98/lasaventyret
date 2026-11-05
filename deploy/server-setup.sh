#!/bin/bash
# Engångsuppsättning på servern. Körs som erik i PuTTY (sudo frågar efter lösenord).
# Förutsätter: DNS lasaventyret.elf98.com -> 185.189.50.240, ~/lasaventyret.conf och
# ~/lasaventyret-dist/ (läggs dit av deploy.ps1 / Claude).
set -e
sudo mkdir -p /var/www/lasaventyret
sudo chown erik:erik /var/www/lasaventyret
cp -r ~/lasaventyret-dist/. /var/www/lasaventyret/
sudo cp ~/lasaventyret.conf /etc/apache2/sites-available/lasaventyret.conf
sudo a2enmod headers rewrite
sudo a2ensite lasaventyret
sudo apache2ctl configtest
sudo systemctl reload apache2
# HTTPS: krävs för PWA-installation och mikrofon på iPaden. Vänta tills DNS svarar först:
#   dig +short lasaventyret.elf98.com   (ska ge 185.189.50.240)
sudo certbot --apache -d lasaventyret.elf98.com --redirect
echo "Klart: https://lasaventyret.elf98.com"
