FROM node:4-alpine
RUN mkdir /JiraRnGen
ADD . /JiraRnGen
WORKDIR /JiraRnGen
RUN npm install
RUN chmod 755 run.sh
ENTRYPOINT ["./run.sh"]
CMD ["-h"]
