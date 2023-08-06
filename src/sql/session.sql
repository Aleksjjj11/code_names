create table if not exists sessions
(
    sid TEXT,
    expired FLOAT not null,
    sess TEXT,
    primary key (sid)
);